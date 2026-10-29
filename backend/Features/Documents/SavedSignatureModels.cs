namespace ShengHengAircon.Api.Features.Documents;

public sealed class SaveMySignatureRequest : SignatureStrokesRequest
{
    // Prevent two open tabs from silently replacing each other's saved signature.
    public Guid? ExpectedId { get; set; }
}
public sealed record SavedSignature(Guid Id, DateTimeOffset UpdatedAt, List<List<SignaturePoint>> Strokes);
public sealed record SavedSignatureContext(SavedSignature? Signature);
public interface ISavedSignatureStore
{
    Task<SavedSignature?> GetSavedSignatureAsync(Guid userId, CancellationToken ct);
    Task<SavedSignature> SaveMySignatureAsync(Guid userId, SaveMySignatureRequest request, CancellationToken ct);
}
