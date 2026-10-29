using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using ShengHengAircon.Api.Features.Documents;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class SavedSignatureStoreTests
{
    private static readonly Guid UserId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid SignatureId = Guid.Parse("40000000-0000-0000-0000-000000000001");
    private static SupabaseDocumentStore Store(HttpClient client) => new(client,
        Microsoft.Extensions.Options.Options.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_secret_test" }));
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UploadRegistersActorExpectedVersionAndContentHash(bool replacing)
    {
        var handler = new Handler(); using var client = new HttpClient(handler); var store = Store(client);
        var result = await store.SaveMySignatureAsync(UserId, new() { ExpectedId = replacing ? SignatureId : null,
            Strokes = [[new(0.1, 0.3), new(0.6, 0.5)]] }, TestContext.Current.CancellationToken);
        Assert.Equal("application/json", handler.ContentType);
        Assert.Equal($"/storage/v1/object/owner-signatures/{UserId:D}/{result.Id:D}.json", handler.Paths[0]);
        Assert.Equal("/rest/v1/rpc/save_owner_signature", handler.Paths[1]);
        var payload = handler.Registration!.Value;
        Assert.Equal(UserId, payload.GetProperty("p_user_id").GetGuid());
        Assert.Equal(result.Id, payload.GetProperty("p_id").GetGuid());
        Assert.Equal(Convert.ToHexString(SHA256.HashData(handler.Uploaded!)), payload.GetProperty("p_signature_sha256").GetString());
        if (replacing) Assert.Equal(SignatureId, payload.GetProperty("p_expected_id").GetGuid());
        else Assert.Equal(JsonValueKind.Null, payload.GetProperty("p_expected_id").ValueKind);
    }
    [Theory]
    [InlineData("40001", 409, true)]
    [InlineData("42501", 403, true)]
    [InlineData("unrecognised", 502, false)]
    public async Task RejectionCleansNewFileOnlyWhenOutcomeIsKnown(string code, int status, bool deleted)
    {
        var handler = new Handler { ErrorCode = code }; using var client = new HttpClient(handler); var store = Store(client);
        var error = await Assert.ThrowsAsync<DocumentException>(() => store.SaveMySignatureAsync(UserId,
            new() { Strokes = [[new(0.1, 0.3), new(0.6, 0.5)]] }, TestContext.Current.CancellationToken));
        Assert.Equal(status, error.StatusCode); Assert.Equal(deleted ? 3 : 2, handler.Paths.Count);
        if (deleted) { Assert.Equal(handler.Paths[0], handler.Paths[2]); Assert.Equal(HttpMethod.Delete, handler.LastMethod); }
    }
    [Fact]
    public async Task LoadReadsOnlyCurrentOwnerAndVerifiesFileBytes()
    {
        var handler = new Handler { Reading = true }; using var client = new HttpClient(handler); var store = Store(client);
        var result = await store.GetSavedSignatureAsync(UserId, TestContext.Current.CancellationToken);
        Assert.Equal(SignatureId, result!.Id); Assert.Equal(2, result.Strokes[0].Count);
        Assert.Contains($"user_id=eq.{UserId:D}", handler.Query);
        Assert.Equal($"/storage/v1/object/authenticated/owner-signatures/{UserId:D}/{SignatureId:D}.json", handler.Paths[1]);
    }
    [Fact]
    public async Task CorruptedStoredSignatureIsNotReturned()
    {
        var handler = new Handler { Reading = true, Corrupt = true }; using var client = new HttpClient(handler); var store = Store(client);
        var error = await Assert.ThrowsAsync<DocumentException>(() => store.GetSavedSignatureAsync(UserId, TestContext.Current.CancellationToken));
        Assert.Equal(502, error.StatusCode);
    }
    private sealed class Handler : HttpMessageHandler
    {
        public string? ErrorCode { get; init; }
        public bool Reading { get; init; }
        public bool Corrupt { get; init; }
        public List<string> Paths { get; } = [];
        public string Query { get; private set; } = "";
        public byte[]? Uploaded { get; private set; }
        public string? ContentType { get; private set; }
        public JsonElement? Registration { get; private set; }
        public HttpMethod? LastMethod { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Paths.Add(request.RequestUri!.AbsolutePath); LastMethod = request.Method;
            if (Reading)
            {
                var bytes = JsonSerializer.SerializeToUtf8Bytes(new { strokes = new[] { new[] { new { x = 0.1, y = 0.3 }, new { x = 0.6, y = 0.5 } } } });
                if (Paths.Count == 1)
                {
                    Query = request.RequestUri.Query;
                    return new(HttpStatusCode.OK) { Content = JsonContent.Create(new[] { new
                    {
                        id = SignatureId, storage_path = $"{UserId:D}/{SignatureId:D}.json", updated_at = DateTimeOffset.UtcNow,
                        signature_sha256 = Corrupt ? new string('0', 64) : Convert.ToHexString(SHA256.HashData(bytes))
                    } }) };
                }
                return new(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) };
            }
            if (Paths.Count == 1)
            {
                Uploaded = await request.Content!.ReadAsByteArrayAsync(ct); ContentType = request.Content.Headers.ContentType?.MediaType;
                return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
            }
            if (Paths.Count == 2)
            {
                Registration = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone();
                return new(ErrorCode is null ? HttpStatusCode.OK : HttpStatusCode.BadRequest)
                { Content = ErrorCode is null ? JsonContent.Create(new { updated_at = DateTimeOffset.UtcNow }) : JsonContent.Create(new { code = ErrorCode }) };
            }
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
        }
    }
}
