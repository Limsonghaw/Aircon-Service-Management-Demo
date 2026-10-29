using System.Text.Json.Serialization;

namespace ShengHengAircon.Api.Features.Expenses;

public sealed record ExpenseReceipt(
    Guid Id,
    [property: JsonPropertyName("expense_id")] Guid ExpenseId,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("content_type")] string ContentType,
    [property: JsonPropertyName("file_size")] long FileSize,
    [property: JsonPropertyName("storage_path")] string StoragePath,
    string Sha256,
    [property: JsonPropertyName("uploaded_by")] Guid UploadedBy,
    [property: JsonPropertyName("uploaded_by_name")] string UploadedByName,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt)
{
    public ExpenseReceiptResponse ToResponse() => new(Id, FileName, ContentType, FileSize, UploadedByName, CreatedAt);
}
public sealed record ExpenseReceiptResponse(Guid Id, string FileName, string ContentType, long FileSize,
    string UploadedByName, DateTimeOffset CreatedAt);
public sealed record ReceiptUpload(string FileName, string ContentType, string Extension, byte[] Bytes);
public sealed class ReceiptException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
public interface IExpenseReceiptStore
{
    Task<bool> IsManagerAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<ExpenseReceipt>> GetAllAsync(Guid expenseId, CancellationToken ct);
    Task<ExpenseReceipt?> GetAsync(Guid expenseId, Guid receiptId, CancellationToken ct);
    Task<ExpenseReceipt> UploadAsync(Guid expenseId, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(ExpenseReceipt receipt, CancellationToken ct);
}
