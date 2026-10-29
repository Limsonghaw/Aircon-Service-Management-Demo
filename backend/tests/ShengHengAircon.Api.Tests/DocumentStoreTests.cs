using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using OptionFactory = Microsoft.Extensions.Options.Options;
using ShengHengAircon.Api.Features.Documents;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class DocumentStoreTests
{
    private static SignedDocument Document() => new(Guid.NewGuid(), "quote", Guid.NewGuid(), DocumentSigningTests.Sample(),
        new() { Date = new(2026, 10, 1) }, [[new(0.1, 0.3), new(0.6, 0.5)]], Guid.NewGuid(), "Boss",
        DateTimeOffset.UtcNow, "quote/sample/sample.pdf", new string('A', 64));
    [Theory]
    [InlineData("sb_secret_test", false)]
    [InlineData("legacy-test-jwt", true)]
    public async Task Upload_UsesCorrectHeadersAndRegistersMetadata(string key, bool bearer)
    {
        var handler = new Handler(); using var http = new HttpClient(handler);
        var store = new SupabaseDocumentStore(http, OptionFactory.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = key }));
        await store.SaveAsync(Document(), [1, 2, 3], TestContext.Current.CancellationToken);
        Assert.Equal(2, handler.Paths.Count);
        Assert.Equal("/storage/v1/object/signed-documents/quote/sample/sample.pdf", handler.Paths[0]);
        Assert.Equal("/rest/v1/rpc/register_signed_document", handler.Paths[1]);
        Assert.Equal(bearer, handler.HadBearer); Assert.True(handler.HadApiKey);
        Assert.Equal("application/pdf", handler.UploadType);
        var payload = JsonDocument.Parse(handler.Registration!);
        Assert.Equal("Boss", payload.RootElement.GetProperty("p_signer_name").GetString());
    }
    [Theory]
    [InlineData("40001", 409)]
    [InlineData("42501", 403)]
    public async Task ExplicitRegistrationRejection_RemovesOnlyNewObject(string code, int status)
    {
        var handler = new Handler { RegistrationError = code }; using var http = new HttpClient(handler);
        var store = new SupabaseDocumentStore(http, OptionFactory.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_secret_test" }));
        var failure = await Assert.ThrowsAsync<DocumentException>(() => store.SaveAsync(Document(), [1, 2], TestContext.Current.CancellationToken));
        Assert.Equal(status, failure.StatusCode); Assert.Equal(3, handler.Paths.Count);
        Assert.Equal(handler.Paths[0], handler.Paths[2]); Assert.Equal(HttpMethod.Delete, handler.LastMethod);
    }
    [Fact]
    public async Task UnknownRegistrationResult_DoesNotDeletePossiblyCommittedPdf()
    {
        var handler = new Handler { RegistrationError = "unknown" }; using var http = new HttpClient(handler);
        var store = new SupabaseDocumentStore(http, OptionFactory.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_secret_test" }));
        var failure = await Assert.ThrowsAsync<DocumentException>(() => store.SaveAsync(Document(), [1, 2], TestContext.Current.CancellationToken));
        Assert.Equal(502, failure.StatusCode); Assert.Equal(2, handler.Paths.Count);
    }
    [Fact]
    public async Task UploadFailure_DoesNotRegisterSignature()
    {
        var handler = new Handler { UploadFailure = true }; using var http = new HttpClient(handler);
        var store = new SupabaseDocumentStore(http, OptionFactory.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_secret_test" }));
        await Assert.ThrowsAsync<DocumentException>(() => store.SaveAsync(Document(), [1, 2], TestContext.Current.CancellationToken));
        Assert.Single(handler.Paths);
    }
    private sealed class Handler : HttpMessageHandler
    {
        public string? RegistrationError { get; init; }
        public bool UploadFailure { get; init; }
        public List<string> Paths { get; } = [];
        public bool HadBearer { get; private set; }
        public bool HadApiKey { get; private set; }
        public string? UploadType { get; private set; }
        public string? Registration { get; private set; }
        public HttpMethod? LastMethod { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Paths.Add(request.RequestUri!.AbsolutePath); LastMethod = request.Method;
            HadBearer = request.Headers.Authorization is not null; HadApiKey = request.Headers.Contains("apikey");
            if (Paths.Count == 1)
            {
                UploadType = request.Content?.Headers.ContentType?.MediaType;
                return new(UploadFailure ? HttpStatusCode.BadGateway : HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
            }
            if (Paths.Count == 2)
            {
                Registration = await request.Content!.ReadAsStringAsync(ct);
                return new(RegistrationError is null ? HttpStatusCode.OK : HttpStatusCode.BadRequest)
                { Content = JsonContent.Create(new { code = RegistrationError }) };
            }
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
        }
    }
}
