using System.Text.Json.Serialization;
using ShengHengAircon.Api.Features.Expenses;

namespace ShengHengAircon.Api.Features.Customers;

public sealed record JobPoDocument(
    Guid Id,
    [property: JsonPropertyName("job_id")] Guid JobId,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("content_type")] string ContentType,
    [property: JsonPropertyName("file_size")] long FileSize,
    [property: JsonPropertyName("storage_path")] string StoragePath,
    string Sha256,
    [property: JsonPropertyName("uploaded_by")] Guid UploadedBy,
    [property: JsonPropertyName("uploaded_by_name")] string UploadedByName,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt)
{
    public JobPoDocumentResponse ToResponse() => new(Id, FileName, ContentType, FileSize, UploadedByName, CreatedAt);
}
public sealed record JobPoDocumentResponse(Guid Id, string FileName, string ContentType, long FileSize,
    string UploadedByName, DateTimeOffset CreatedAt);
public sealed class JobPoDocumentException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
public interface IJobPoDocumentStore
{
    Task<bool> CanAccessAsync(Guid jobId, Guid userId, CancellationToken ct);
    Task<IReadOnlyList<JobPoDocument>> GetAllAsync(Guid jobId, CancellationToken ct);
    Task<JobPoDocument?> GetAsync(Guid jobId, Guid documentId, CancellationToken ct);
    Task<JobPoDocument> UploadAsync(Guid jobId, Guid documentId, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(JobPoDocument document, CancellationToken ct);
}
public static class JobPoFileValidation
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public static ReceiptUpload Validate(string name, string? type, byte[] bytes)
    {
        try
        {
            var upload = ReceiptFileValidation.Validate(name, type, bytes);
            if (upload.ContentType != "application/pdf")
                throw new JobPoDocumentException("PO 附件只支持 PDF。", 400);
            return upload;
        }
        catch (ReceiptException e)
        {
            throw new JobPoDocumentException(e.StatusCode == 413 ? "PO PDF 不能超过 10 MB。"
                : "请选择有效的 PDF 文件；文件不能为空，文件名最多 200 个字符，内容须与格式一致。", e.StatusCode);
        }
    }
}
