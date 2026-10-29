using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Globalization;

namespace ShengHengAircon.Api.Features.Documents;

public sealed record SignaturePoint(double X, double Y);
public sealed class SignDocumentRequest : SignatureStrokesRequest
{
    [Required, RegularExpression("^[A-Fa-f0-9]{64}$")] public string Version { get; set; } = "";
    [Required] public PrintFields Fields { get; set; } = new();
}
public class SignatureStrokesRequest : IValidatableObject
{
    [Required, MinLength(1), MaxLength(100)] public List<List<SignaturePoint>> Strokes { get; set; } = [];
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Strokes is null) yield break;
        if (Strokes.Any(s => s is null || s.Count < 2 || s.Count > 2000) ||
            Strokes.Sum(s => s?.Count ?? 0) > 10000 ||
            Strokes.Where(s => s is not null).SelectMany(s => s).Any(p => p is null ||
                !double.IsFinite(p.X) || !double.IsFinite(p.Y) || p.X < 0 || p.X > 1 || p.Y < 0 || p.Y > 1))
            yield return new("签名笔画无效，请清除后重新签名。", [nameof(Strokes)]);
        else if (Strokes.SelectMany(s => s).Select(p => (p.X, p.Y)).Distinct().Count() < 2)
            yield return new("请手写签名，不能只点击画板。", [nameof(Strokes)]);
    }
}
public sealed class PrintFields : IValidatableObject
{
    public DateOnly Date { get; set; }
    [StringLength(100)] public string Reference { get; set; } = "";
    [StringLength(100)] public string Attention { get; set; } = "";
    [StringLength(200)] public string Term { get; set; } = "";
    [StringLength(100)] public string ServiceMan { get; set; } = "";
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Date == default) yield return new("请填写单据日期。", [nameof(Date)]);
    }
}
public sealed record SignedDocument(Guid Id, string Kind, Guid DocumentId, JsonElement Snapshot,
    PrintFields Fields, List<List<SignaturePoint>> Strokes, Guid SignerId, string SignerName,
    DateTimeOffset SignedAt, string StoragePath, string PdfSha256);
public sealed record SignatureSummary(Guid Id, string SignerName, DateTimeOffset SignedAt, bool IsCurrent);
public sealed record SigningContext(string Version, JsonElement Snapshot, IReadOnlyList<SignatureSummary> History);
public sealed class DocumentException(string message, int statusCode, Exception? innerException = null) : Exception(message, innerException)
{
    public int StatusCode { get; } = statusCode;
}
public static class DocumentVersion
{
    public static string Hash(JsonElement snapshot)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) WriteCanonical(writer, snapshot);
        return Convert.ToHexString(SHA256.HashData(stream.ToArray()));
    }
    private static void WriteCanonical(Utf8JsonWriter writer, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject();
            foreach (var property in value.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
            { writer.WritePropertyName(property.Name); WriteCanonical(writer, property.Value); }
            writer.WriteEndObject();
        }
        else if (value.ValueKind == JsonValueKind.Array)
        {
            writer.WriteStartArray();
            foreach (var item in value.EnumerateArray()) WriteCanonical(writer, item);
            writer.WriteEndArray();
        }
        else if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
            writer.WriteRawValue(number.ToString("G29", CultureInfo.InvariantCulture));
        else value.WriteTo(writer);
    }
}
public interface IDocumentStore
{
    Task<JsonElement?> SnapshotAsync(string kind, Guid id, CancellationToken ct);
    Task<bool> IsOwnerAsync(Guid userId, CancellationToken ct);
    Task<string> OwnerNameAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<SignedDocument>> HistoryAsync(string kind, Guid id, CancellationToken ct);
    Task SaveAsync(SignedDocument document, byte[] pdf, CancellationToken ct);
    Task<byte[]> DownloadAsync(string path, CancellationToken ct);
}
public interface IDocumentPdfRenderer
{
    Task<byte[]> RenderAsync(JsonElement snapshot, PrintFields fields, List<List<SignaturePoint>> strokes,
        string signerName, DateTimeOffset signedAt, Guid signatureId, CancellationToken ct);
}
