using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Documents;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class SavedSignatureTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly Guid OwnerId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid DocumentId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    private static List<List<SignaturePoint>> Strokes() => [[new(0.1, 0.3), new(0.6, 0.5)]];
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App(Store store) =>
        factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IDocumentStore>(); services.AddSingleton<IDocumentStore>(store);
            services.RemoveAll<ISavedSignatureStore>(); services.AddSingleton<ISavedSignatureStore>(store);
            services.RemoveAll<IDocumentPdfRenderer>(); services.AddSingleton<IDocumentPdfRenderer>(new Renderer());
        }));

    [Theory]
    [InlineData("admin")]
    [InlineData("employee")]
    public async Task OtherRoles_CannotReadOrSaveOwnersReusableSignature(string role)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/documents/my-signature", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { Strokes = Strokes() }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.SignatureCalls);
    }
    [Fact]
    public async Task Anonymous_CannotAccessSavedSignature()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/documents/my-signature", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { Strokes = Strokes() }, TestContext.Current.CancellationToken)).StatusCode);
    }
    [Fact]
    public async Task DemotedOwner_CannotReadOrSaveDespiteStaleCookie()
    {
        var store = new Store { Owner = false }; await using var app = App(store); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/documents/my-signature", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { Strokes = Strokes() }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.SignatureCalls);
    }
    [Fact]
    public async Task NoSavedSignature_ReturnsJsonAndDoesNotCache()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        var response = await client.GetAsync("/api/documents/my-signature", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null((await response.Content.ReadFromJsonAsync<SavedSignatureContext>(TestContext.Current.CancellationToken))!.Signature);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.Equal(OwnerId, store.LastUser);
    }
    [Fact]
    public async Task InvalidCoordinatesAndEmptySignature_CannotBeSaved()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        foreach (var strokes in new List<List<SignaturePoint>>[] { [], [[new(-0.1, 0.2), new(0.5, 0.5)]], [[new(0.2, 0.2), new(0.2, 0.2)]] })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { Strokes = strokes }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.SignatureCalls);
    }
    [Fact]
    public async Task ReuseOnQuoteAndInvoice_ReplacementDoesNotChangeHistoricalPdfs()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        var save = await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { Strokes = Strokes() }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var saved = (await client.GetFromJsonAsync<SavedSignatureContext>("/api/documents/my-signature", TestContext.Current.CancellationToken))!.Signature!;
        Assert.Equal(Strokes()[0], saved.Strokes[0]);
        var downloads = new List<(string Url, byte[] Bytes)>();
        foreach (var kind in new[] { "quote", "invoice" })
        {
            var sign = await client.PostAsJsonAsync($"/api/documents/{kind}/{DocumentId}/sign", new SignDocumentRequest
            {
                Version = DocumentVersion.Hash(DocumentSigningTests.Sample(kind)), Fields = new() { Date = new(2026, 10, 1) }, Strokes = saved.Strokes
            }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, sign.StatusCode);
            var result = (await sign.Content.ReadFromJsonAsync<SignatureSummary>(TestContext.Current.CancellationToken))!;
            var url = $"/api/documents/{kind}/{DocumentId}/signed/{result.Id}/pdf";
            downloads.Add((url, await client.GetByteArrayAsync(url, TestContext.Current.CancellationToken)));
            Assert.Equal(saved.Strokes[0], store.Documents.Last().Strokes[0]);
        }
        var replacement = await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest
        { ExpectedId = saved.Id, Strokes = [[new(0.2, 0.8), new(0.8, 0.1)]] }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, replacement.StatusCode);
        var refreshed = (await client.GetFromJsonAsync<SavedSignatureContext>("/api/documents/my-signature", TestContext.Current.CancellationToken))!.Signature!;
        Assert.NotEqual(saved.Id, refreshed.Id);
        Assert.NotEqual(saved.Strokes[0], refreshed.Strokes[0]);
        foreach (var download in downloads) Assert.Equal(download.Bytes, await client.GetByteArrayAsync(download.Url, TestContext.Current.CancellationToken));
        var stale = await client.PutAsJsonAsync("/api/documents/my-signature", new SaveMySignatureRequest { ExpectedId = saved.Id, Strokes = Strokes() }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }
    private sealed class Renderer : IDocumentPdfRenderer
    {
        public Task<byte[]> RenderAsync(JsonElement snapshot, PrintFields fields, List<List<SignaturePoint>> strokes,
            string signerName, DateTimeOffset signedAt, Guid signatureId, CancellationToken ct) =>
            Task.FromResult(Encoding.UTF8.GetBytes("%PDF-test-" + JsonSerializer.Serialize(strokes)));
    }
    private sealed class Store : IDocumentStore, ISavedSignatureStore
    {
        public bool Owner { get; init; } = true;
        public int SignatureCalls { get; private set; }
        public Guid LastUser { get; private set; }
        private SavedSignature? saved;
        public List<SignedDocument> Documents { get; } = [];
        private readonly Dictionary<string, byte[]> files = [];
        public Task<bool> IsOwnerAsync(Guid userId, CancellationToken ct) => Task.FromResult(Owner);
        public Task<string> OwnerNameAsync(Guid userId, CancellationToken ct) => Task.FromResult("Boss");
        public Task<JsonElement?> SnapshotAsync(string kind, Guid id, CancellationToken ct) => Task.FromResult<JsonElement?>(DocumentSigningTests.Sample(kind));
        public Task<IReadOnlyList<SignedDocument>> HistoryAsync(string kind, Guid id, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<SignedDocument>>(Documents.Where(d => d.Kind == kind && d.DocumentId == id).ToList());
        public Task SaveAsync(SignedDocument document, byte[] pdf, CancellationToken ct)
        { Documents.Add(document); files[document.StoragePath] = pdf; return Task.CompletedTask; }
        public Task<byte[]> DownloadAsync(string path, CancellationToken ct) => Task.FromResult(files[path]);
        public Task<SavedSignature?> GetSavedSignatureAsync(Guid userId, CancellationToken ct)
        { SignatureCalls++; LastUser = userId; return Task.FromResult(saved); }
        public Task<SavedSignature> SaveMySignatureAsync(Guid userId, SaveMySignatureRequest request, CancellationToken ct)
        {
            SignatureCalls++; LastUser = userId;
            if (request.ExpectedId != saved?.Id) throw new DocumentException("Saved signature changed", 409);
            saved = new(Guid.NewGuid(), DateTimeOffset.UtcNow, request.Strokes);
            return Task.FromResult(saved);
        }
    }
}
