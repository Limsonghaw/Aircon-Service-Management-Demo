using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Customers;

[ApiController, Route("api/jobs/{jobId:guid}/po-documents"), Authorize(Policy = AuthorizationPolicies.Management)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class JobPoDocumentsController(IJobPoDocumentStore store, ILogger<JobPoDocumentsController> logger) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public Task<IActionResult> List(Guid jobId, CancellationToken ct) => ExecuteAsync(async () =>
        Ok((await store.GetAllAsync(jobId, ct)).Select(document => document.ToResponse())), jobId, ct);

    // A stable ID belongs to one selected file. Retrying cannot overwrite another upload.
    [HttpPost("{documentId:guid}"), Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 11 * 1024 * 1024)]
    public Task<IActionResult> Upload(Guid jobId, Guid documentId, [FromForm] IFormFile? file, CancellationToken ct) => ExecuteAsync(async () =>
    {
        if (documentId == Guid.Empty) return Problem(statusCode: 400, detail: "附件编号无效，请重新选择文件。");
        if (file is null || file.Length == 0) return Problem(statusCode: 400, detail: "请选择非空的 PO PDF 文件。");
        if (file.Length > JobPoFileValidation.MaxBytes) return Problem(statusCode: 413, detail: "PO PDF 不能超过 10 MB。");
        using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, ct);
        var upload = JobPoFileValidation.Validate(file.FileName, file.ContentType, memory.ToArray());
        var document = await store.UploadAsync(jobId, documentId, UserId, upload, ct);
        return CreatedAtAction(nameof(Content), new { jobId, documentId }, document.ToResponse());
    }, jobId, ct);

    [HttpGet("{documentId:guid}/file")]
    public Task<IActionResult> Content(Guid jobId, Guid documentId, [FromQuery] bool download, CancellationToken ct) => ExecuteAsync(async () =>
    {
        var document = await store.GetAsync(jobId, documentId, ct);
        if (document is null) return NotFound();
        var bytes = await store.DownloadAsync(document, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (download) return File(bytes, "application/pdf", document.FileName);
        Response.Headers.ContentDisposition = "inline";
        return File(bytes, "application/pdf");
    }, jobId, ct);

    private async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> operation, Guid jobId, CancellationToken ct)
    {
        try
        {
            // Re-check the live profile for uploads, lists, views and downloads.
            if (!await store.CanAccessAsync(jobId, UserId, ct)) return Forbid();
            return await operation();
        }
        catch (JobPoDocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (Exception e) when (e is HttpRequestException or JsonException || e is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(e, "PO PDF request did not complete for job {JobId}", jobId);
            return Problem(statusCode: 502, detail: "PO PDF 请求未完成。已选文件可保留并重试，历史文件不会被覆盖。");
        }
    }
}
