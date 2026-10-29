using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Documents;

[ApiController, Route("api/document-archives/{kind}"), Authorize(Policy = AuthorizationPolicies.Management)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ArchivedDocumentsController(IArchivedDocumentStore store, ILogger<ArchivedDocumentsController> logger) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public Task<IActionResult> List(string kind, CancellationToken ct) => Execute(kind, null, async () =>
        Ok((await store.ListAsync(kind, ct)).Select(x => x.ToResponse())), ct);

    [HttpPost("{id:guid}"), Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 11 * 1024 * 1024)]
    public Task<IActionResult> Upload(string kind, Guid id, [FromForm] Guid customerId, [FromForm] string? originalNumber,
        [FromForm] DateOnly? originalDate, [FromForm] bool confirmDuplicate, [FromForm] IFormFile? file, CancellationToken ct) =>
        Execute(kind, customerId, async () =>
        {
            var number = string.IsNullOrWhiteSpace(originalNumber) ? null : originalNumber.Trim();
            if (id == Guid.Empty || customerId == Guid.Empty || number?.Length > 50)
                return Problem(statusCode: 400, detail: "请选择客户，原编号最多 50 个字符。");
            if (file is null || file.Length == 0) return Problem(statusCode: 400, detail: "请选择非空的 PDF。");
            if (file.Length > CustomerReturnedFileValidation.MaxBytes) return Problem(statusCode: 413, detail: "PDF 不能超过 10 MB。");
            using var memory = new MemoryStream((int)file.Length);
            await file.CopyToAsync(memory, ct);
            var upload = CustomerReturnedFileValidation.Validate(file.FileName, file.ContentType, memory.ToArray());
            var saved = await store.UploadAsync(kind, id, customerId, number, originalDate, confirmDuplicate, UserId, upload, ct);
            return CreatedAtAction(nameof(Content), new { kind, id }, saved.ToResponse());
        }, ct);

    [HttpGet("{id:guid}/file")]
    public Task<IActionResult> Content(string kind, Guid id, [FromQuery] bool download, CancellationToken ct) => Execute(kind, null, async () =>
    {
        var document = await store.GetAsync(kind, id, ct);
        if (document is null) return NotFound();
        if (!await store.CanAccessAsync(UserId, document.CustomerId, ct)) return Forbid();
        var bytes = await store.DownloadAsync(document, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (download) return File(bytes, "application/pdf", document.FileName);
        Response.Headers.ContentDisposition = "inline";
        return File(bytes, "application/pdf");
    }, ct);

    private async Task<IActionResult> Execute(string kind, Guid? customerId, Func<Task<IActionResult>> operation, CancellationToken ct)
    {
        try
        {
            if (kind is not ("quote" or "invoice")) return NotFound();
            if (!await store.CanAccessAsync(UserId, customerId, ct)) return Forbid();
            return await operation();
        }
        catch (CustomerReturnedDocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (Exception e) when (e is HttpRequestException or JsonException || e is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(e, "Archive request failed for {Kind}", kind);
            return Problem(statusCode: 502, detail: "归档请求未完成，请重试。若尚未启用归档数据库，请先完成经确认的迁移；原有单据不受影响。");
        }
    }
}
