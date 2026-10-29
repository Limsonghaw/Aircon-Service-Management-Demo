using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Documents;

[ApiController, Route("api/documents/{kind}/{id:guid}"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class DocumentsController : ControllerBase
{
    private static bool Supported(string kind) => kind is "quote" or "invoice";
    [HttpGet("signing-context")]
    public async Task<IActionResult> Context(string kind, Guid id, [FromServices] IDocumentStore store, CancellationToken ct)
    {
        if (!Supported(kind)) return NotFound();
        var snapshot = await store.SnapshotAsync(kind, id, ct);
        if (snapshot is null) return NotFound();
        var version = DocumentVersion.Hash(snapshot.Value);
        var history = await store.HistoryAsync(kind, id, ct);
        return Ok(new SigningContext(version, snapshot.Value, history.Select(d => new SignatureSummary(d.Id, d.SignerName,
            d.SignedAt, DocumentVersion.Hash(d.Snapshot) == version)).ToList()));
    }

    [HttpPost("sign"), Authorize(Policy = AuthorizationPolicies.Owner), RequestSizeLimit(1048576)]
    public async Task<IActionResult> Sign(string kind, Guid id, SignDocumentRequest request,
        [FromServices] IDocumentStore store, [FromServices] IDocumentPdfRenderer renderer, CancellationToken ct)
    {
        if (!Supported(kind)) return NotFound();
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            // Cookie claims may be stale after a role change: check the live profile too.
            if (!await store.IsOwnerAsync(userId, ct)) return Forbid();
            var snapshot = await store.SnapshotAsync(kind, id, ct);
            if (snapshot is null) return NotFound();
            if (!string.Equals(request.Version, DocumentVersion.Hash(snapshot.Value), StringComparison.OrdinalIgnoreCase))
                return Problem(statusCode: 409, detail: "单据或客户资料已修改，请关闭预览后重新打开并签名。");
            var signatureId = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            var signerName = await store.OwnerNameAsync(userId, ct);
            var pdf = await renderer.RenderAsync(snapshot.Value, request.Fields, request.Strokes, signerName, now, signatureId, ct);
            var document = new SignedDocument(signatureId, kind, id, snapshot.Value, request.Fields, request.Strokes,
                userId, signerName, now, $"{kind}/{id:D}/{signatureId:D}.pdf", Convert.ToHexString(SHA256.HashData(pdf)));
            await store.SaveAsync(document, pdf, ct);
            return Ok(new SignatureSummary(signatureId, signerName, now, true));
        }
        catch (DocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
    }

    [HttpGet("signed/{signatureId:guid}/pdf")]
    public async Task<IActionResult> Download(string kind, Guid id, Guid signatureId,
        [FromServices] IDocumentStore store, CancellationToken ct)
    {
        if (!Supported(kind)) return NotFound();
        var document = (await store.HistoryAsync(kind, id, ct)).SingleOrDefault(d => d.Id == signatureId);
        if (document is null) return NotFound();
        var pdf = await store.DownloadAsync(document.StoragePath, ct);
        if (Convert.ToHexString(SHA256.HashData(pdf)) != document.PdfSha256)
            return Problem(statusCode: 502, detail: "PDF 完整性校验失败，请联系管理员。");
        Response.Headers.CacheControl = "no-store";
        return File(pdf, "application/pdf", $"{kind}-{id:D}-signed-{signatureId:D}.pdf");
    }
}
