using System.Text.Json.Serialization;
using ShengHengAircon.Api.Features.Expenses;

namespace ShengHengAircon.Api.Features.Documents;

public sealed record ReferenceDocument(
    Guid Id,
    string Kind,
    [property: JsonPropertyName("document_id")] Guid DocumentId,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("content_type")] string ContentType,
    [property: JsonPropertyName("file_size")] long FileSize,
    [property: JsonPropertyName("storage_path")] string StoragePath,
    string Sha256,
    [property: JsonPropertyName("uploaded_by")] Guid UploadedBy,
    [property: JsonPropertyName("uploaded_by_name")] string UploadedByName,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt)
{
    public ReferenceDocumentResponse ToResponse() => new(Id, FileName, ContentType, FileSize, UploadedByName, CreatedAt);
}
public sealed record ReferenceDocumentResponse(Guid Id, string FileName, string ContentType, long FileSize,
    string UploadedByName, DateTimeOffset CreatedAt);
public interface IReferenceDocumentStore
{
    Task<bool> CanAccessAsync(string kind, Guid documentId, Guid userId, CancellationToken ct);
    Task<IReadOnlyList<ReferenceDocument>> GetAllAsync(string kind, Guid documentId, CancellationToken ct);
    Task<ReferenceDocument?> GetAsync(string kind, Guid documentId, Guid attachmentId, CancellationToken ct);
    Task<ReferenceDocument> UploadAsync(string kind, Guid documentId, Guid attachmentId, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(ReferenceDocument document, CancellationToken ct);
}
