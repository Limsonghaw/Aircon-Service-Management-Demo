using System.Text.Json.Serialization;
using ShengHengAircon.Api.Features.Expenses;

namespace ShengHengAircon.Api.Features.Documents;

public sealed record CustomerReturnedDocument(
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
    public CustomerReturnedDocumentResponse ToResponse() => new(Id, FileName, ContentType, FileSize, UploadedByName, CreatedAt);
}
public sealed record CustomerReturnedDocumentResponse(Guid Id, string FileName, string ContentType, long FileSize,
    string UploadedByName, DateTimeOffset CreatedAt);
public sealed class CustomerReturnedDocumentException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
public interface ICustomerReturnedDocumentStore
{
    Task<bool> CanAccessAsync(string kind, Guid documentId, Guid userId, CancellationToken ct);
    Task<IReadOnlyList<CustomerReturnedDocument>> GetAllAsync(string kind, Guid documentId, CancellationToken ct);
    Task<CustomerReturnedDocument?> GetAsync(string kind, Guid documentId, Guid attachmentId, CancellationToken ct);
    Task<CustomerReturnedDocument> UploadAsync(string kind, Guid documentId, Guid attachmentId, Guid userId, ReceiptUpload upload, CancellationToken ct);
    Task<byte[]> DownloadAsync(CustomerReturnedDocument document, CancellationToken ct);
}
public static class CustomerReturnedFileValidation
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public static ReceiptUpload Validate(string name, string? type, byte[] bytes)
    {
        try
        {
            var upload = ReceiptFileValidation.Validate(name, type, bytes);
            if (upload.ContentType != "application/pdf")
                throw new CustomerReturnedDocumentException("客户签回附件只支持 PDF。", 400);
            return upload;
        }
        catch (ReceiptException e)
        {
            throw new CustomerReturnedDocumentException(e.StatusCode == 413 ? "客户签回 PDF 不能超过 10 MB。"
                : "请选择有效的 PDF 文件；文件不能为空，文件名最多 200 个字符，内容须与格式一致。", e.StatusCode);
        }
    }
}
