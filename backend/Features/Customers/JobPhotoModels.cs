using ShengHengAircon.Api.Features.Expenses;
using System.Text.Json.Serialization;

namespace ShengHengAircon.Api.Features.Customers;

public sealed record JobPhoto(
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
    public JobPhotoResponse ToResponse() => new(Id, FileName, ContentType, FileSize, UploadedByName, CreatedAt);
}
public sealed record JobPhotoResponse(Guid Id, string FileName, string ContentType, long FileSize,
    string UploadedByName, DateTimeOffset CreatedAt);
public sealed class JobPhotoException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
public interface IJobPhotoStore
{
    Task<bool> CanAccessAsync(Guid jobId, Guid userId, CancellationToken ct);
    Task<IReadOnlyList<JobPhoto>> GetAllAsync(Guid jobId, CancellationToken ct);
    Task<JobPhoto?> GetAsync(Guid jobId, Guid photoId, CancellationToken ct);
    Task<JobPhoto> UploadAsync(Guid jobId, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(JobPhoto photo, CancellationToken ct);
}
