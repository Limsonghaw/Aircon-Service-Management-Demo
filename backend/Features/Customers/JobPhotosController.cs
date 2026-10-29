using ShengHengAircon.Api.Features.Expenses;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ShengHengAircon.Api.Features.Customers;

[ApiController, Route("api/jobs/{jobId:guid}/photos"), Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class JobPhotosController(IJobPhotoStore store,
    ILogger<JobPhotosController> logger) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public Task<IActionResult> List(Guid jobId, CancellationToken ct) => ExecuteAsync(async () =>
    {
        return Ok((await store.GetAllAsync(jobId, ct)).Select(r => r.ToResponse()));
    }, jobId, ct);

    [HttpPost, Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 11 * 1024 * 1024)]
    public Task<IActionResult> Upload(Guid jobId, [FromForm] IFormFile? file, CancellationToken ct) => ExecuteAsync(async () =>
    {
        if (file is null) return Problem(statusCode: 400, detail: "请选择工作照片文件。");
        if (file.Length == 0) return Problem(statusCode: 400, detail: "工作照片文件为空。");
        if (file.Length > ReceiptFileValidation.MaxBytes) return Problem(statusCode: 413, detail: "工作照片文件不能超过 10 MB。");
        using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, ct);
        var upload = ReceiptFileValidation.Validate(file.FileName, file.ContentType, memory.ToArray());
        if (upload.ContentType is not ("image/jpeg" or "image/png"))
            return Problem(statusCode: 400, detail: "请选择 JPG 或 PNG 工作照片。");
        var photo = await store.UploadAsync(jobId, UserId, upload, ct);
        return CreatedAtAction(nameof(Content), new { jobId, photoId = photo.Id }, photo.ToResponse());
    }, jobId, ct);

    [HttpGet("{photoId:guid}/file")]
    public Task<IActionResult> Content(Guid jobId, Guid photoId, [FromQuery] bool download, CancellationToken ct) => ExecuteAsync(async () =>
    {
        var photo = await store.GetAsync(jobId, photoId, ct);
        if (photo is null) return NotFound();
        var bytes = await store.DownloadAsync(photo, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (download) return File(bytes, photo.ContentType, photo.FileName);
        Response.Headers.ContentDisposition = "inline";
        return File(bytes, photo.ContentType);
    }, jobId, ct);

    private async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> operation, Guid jobId, CancellationToken ct)
    {
        try
        {
            if (!await store.CanAccessAsync(jobId, UserId, ct)) return Forbid();
            return await operation();
        }
        catch (ReceiptException e) { return Problem(statusCode: e.StatusCode, detail: e.Message.Replace("收据", "工作照片")); }
        catch (JobPhotoException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (HttpRequestException e)
        {
            logger.LogError(e, "Job photo operation failed");
            return Problem(statusCode: 502, detail: "工作照片请求未完成，请刷新工作照片列表检查后再重试。");
        }
        catch (OperationCanceledException e) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning(e, "Job photo request timed out");
            return Problem(statusCode: 504, detail: "工作照片请求超时，请刷新工作照片列表检查后再重试。");
        }
    }
}
