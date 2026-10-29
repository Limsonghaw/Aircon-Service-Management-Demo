using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Documents;

[ApiController, Route("api/documents/{kind}/{documentId:guid}/reference-pdfs"), Authorize(Policy = AuthorizationPolicies.Management)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ReferenceDocumentsController(IReferenceDocumentStore store, ILogger<ReferenceDocumentsController> logger) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public Task<IActionResult> List(string kind, Guid documentId, CancellationToken ct) => ExecuteAsync(async () =>
        Ok((await store.GetAllAsync(kind, documentId, ct)).Select(document => document.ToResponse())), kind, documentId, ct);

    // A stable ID belongs to one selected file. Retrying cannot overwrite another upload.
    [HttpPost("{attachmentId:guid}"), Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 11 * 1024 * 1024)]
    public Task<IActionResult> Upload(string kind, Guid documentId, Guid attachmentId, [FromForm] IFormFile? file, CancellationToken ct) => ExecuteAsync(async () =>
    {
        if (attachmentId == Guid.Empty) return Problem(statusCode: 400, detail: "附件编号无效，请重新选择文件。");
        if (file is null || file.Length == 0) return Problem(statusCode: 400, detail: "请选择非空的参考原件 PDF 文件。");
        if (file.Length > CustomerReturnedFileValidation.MaxBytes) return Problem(statusCode: 413, detail: "参考原件 PDF 不能超过 10 MB。");
        using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, ct);
        var upload = CustomerReturnedFileValidation.Validate(file.FileName, file.ContentType, memory.ToArray());
        var document = await store.UploadAsync(kind, documentId, attachmentId, UserId, upload, ct);
        return CreatedAtAction(nameof(Content), new { kind, documentId, attachmentId }, document.ToResponse());
    }, kind, documentId, ct);

    [HttpGet("{attachmentId:guid}/file")]
    public Task<IActionResult> Content(string kind, Guid documentId, Guid attachmentId, [FromQuery] bool download, CancellationToken ct) => ExecuteAsync(async () =>
    {
        var document = await store.GetAsync(kind, documentId, attachmentId, ct);
        if (document is null) return NotFound();
        var bytes = await store.DownloadAsync(document, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (download) return File(bytes, "application/pdf", document.FileName);
        Response.Headers.ContentDisposition = "inline";
        return File(bytes, "application/pdf");
    }, kind, documentId, ct);

    private async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> operation, string kind, Guid documentId, CancellationToken ct)
    {
        try
        {
            if (kind is not ("quote" or "invoice")) return NotFound();
            // Re-check the live profile for uploads, lists, views and downloads.
            if (!await store.CanAccessAsync(kind, documentId, UserId, ct)) return Forbid();
            return await operation();
        }
        catch (CustomerReturnedDocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message.Replace("客户签回", "参考原件")); }
        catch (Exception e) when (e is HttpRequestException or JsonException || e is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(e, "Reference PDF request failed for {Kind} {DocumentId}", kind, documentId);
            return Problem(statusCode: 502, detail: "参考原件 PDF 请求未完成。已选文件可保留并重试，历史文件不会被覆盖。");
        }
    }
}
