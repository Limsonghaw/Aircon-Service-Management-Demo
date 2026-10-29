using System.Text.Json.Serialization;
using ShengHengAircon.Api.Features.Expenses;

namespace ShengHengAircon.Api.Features.Documents;

public sealed record ArchivedDocument(
    Guid Id, string Kind,
    [property: JsonPropertyName("customer_id")] Guid CustomerId,
    [property: JsonPropertyName("customer_name")] string CustomerName,
    [property: JsonPropertyName("original_number")] string? OriginalNumber,
    [property: JsonPropertyName("original_date")] DateOnly? OriginalDate,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("file_size")] long FileSize,
    [property: JsonPropertyName("storage_path")] string StoragePath,
    string Sha256,
    [property: JsonPropertyName("uploaded_by")] Guid UploadedBy,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt)
{
    public object ToResponse() => new { Id, Kind, CustomerId, CustomerName, OriginalNumber, OriginalDate, FileName, FileSize, CreatedAt };
}

public interface IArchivedDocumentStore
{
    Task<bool> CanAccessAsync(Guid userId, Guid? customerId, CancellationToken ct);
    Task<IReadOnlyList<ArchivedDocument>> ListAsync(string kind, CancellationToken ct);
    Task<ArchivedDocument?> GetAsync(string kind, Guid id, CancellationToken ct);
    Task<ArchivedDocument> UploadAsync(string kind, Guid id, Guid customerId, string? number, DateOnly? date,
        bool confirmDuplicate, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(ArchivedDocument document, CancellationToken ct);
}
