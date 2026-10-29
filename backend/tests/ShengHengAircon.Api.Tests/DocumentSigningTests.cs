using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Documents;
using Xunit;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Tests;

public sealed class DocumentSigningTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly Guid DocumentId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    public static JsonElement Sample(string kind = "quote", int count = 2) => JsonSerializer.SerializeToElement(new
    {
        kind,
        document = new
        {
            id = DocumentId,
            quote_number = "Q-SIGNED-1",
            invoice_number = "INV-SIGNED-1",
            valid_until = "2026-10-31",
            due_date = "2026-10-31",
            amount = count * 650 - 50,
            discount = 50,
            status = "accepted",
            notes = "Please contact us before arrival.\n备注：工作安排确认后施工。"
        },
        customer = new { name = "Example Customer Sdn Bhd 示例客户", address = "12, Jalan Example\n81100 Johor Bahru", phone = "0123456789", email = "customer@example.test" },
        items = Enumerable.Range(1, count).Select(i => new { description = $"Air-conditioning service {i}\n冷气清洗和检查", quantity = 1, unit_price = 650, unitPrice = 650 })
    });
    private static SignDocumentRequest Input() => new()
    {
        Version = DocumentVersion.Hash(Sample()),
        Fields = new() { Date = new(2026, 10, 1), Term = "30 days" },
        Strokes = [[new(0.1, 0.5), new(0.2, 0.3), new(0.35, 0.6), new(0.5, 0.25), new(0.6, 0.55)]]
    };
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App(FakeStore store, FakeRenderer renderer) =>
        factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IDocumentStore>(); services.AddSingleton<IDocumentStore>(store);
            services.RemoveAll<IDocumentPdfRenderer>(); services.AddSingleton<IDocumentPdfRenderer>(renderer);
        }));

    [Theory]
    [InlineData("admin")]
    [InlineData("employee")]
    public async Task NonOwner_CannotSign(string role)
    {
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-Role", role);
        using var response = await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", Input(), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
    [Fact]
    public async Task Anonymous_CannotReadSignatures()
    {
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/documents/quote/{DocumentId}/signing-context", TestContext.Current.CancellationToken)).StatusCode);
    }
    [Fact]
    public async Task Employee_CannotDownloadPdf()
    {
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-Role", "employee");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/documents/quote/{DocumentId}/signed/{Guid.NewGuid()}/pdf", TestContext.Current.CancellationToken)).StatusCode);
    }
    [Fact]
    public async Task StaleOwnerClaim_CannotSign()
    {
        var store = new FakeStore { Owner = false }; var renderer = new FakeRenderer();
        await using var app = App(store, renderer); using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", Input(), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode); Assert.False(renderer.Called);
    }
    [Fact]
    public async Task StaleVersion_ReturnsConflictBeforeRendering()
    {
        var store = new FakeStore(); var renderer = new FakeRenderer();
        await using var app = App(store, renderer); using var client = app.CreateClient();
        var input = Input(); input.Version = new string('0', 64);
        var response = await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", input, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode); Assert.False(renderer.Called);
    }
    [Theory]
    [InlineData(-0.1)]
    [InlineData(1.1)]
    public async Task InvalidStroke_ReturnsBadRequest(double coordinate)
    {
        var store = new FakeStore(); var renderer = new FakeRenderer();
        await using var app = App(store, renderer); using var client = app.CreateClient();
        var input = Input(); input.Strokes = [[new(coordinate, 0.5), new(0.5, 0.5)]];
        var response = await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", input, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.False(renderer.Called);
    }
    [Fact]
    public async Task Owner_SavesPdfAndDownloadsExactBytes()
    {
        var store = new FakeStore(); var renderer = new FakeRenderer();
        await using var app = App(store, renderer); using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", Input(), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<SignatureSummary>(TestContext.Current.CancellationToken);
        Assert.NotNull(store.Saved); Assert.Equal("Boss", store.Saved.SignerName);
        var download = await client.GetAsync($"/api/documents/quote/{DocumentId}/signed/{result!.Id}/pdf", TestContext.Current.CancellationToken);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal(renderer.Bytes, await download.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        var wrongDocument = await client.GetAsync($"/api/documents/invoice/{Guid.NewGuid()}/signed/{result.Id}/pdf", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, wrongDocument.StatusCode);
    }
    [Fact]
    public async Task ChangedDocument_LabelsHistoryAsOld()
    {
        var store = new FakeStore(); var renderer = new FakeRenderer();
        await using var app = App(store, renderer); using var client = app.CreateClient();
        await client.PostAsJsonAsync($"/api/documents/quote/{DocumentId}/sign", Input(), TestContext.Current.CancellationToken);
        store.Current = Sample("quote", 3);
        var context = await client.GetFromJsonAsync<SigningContext>($"/api/documents/quote/{DocumentId}/signing-context", TestContext.Current.CancellationToken);
        Assert.False(Assert.Single(context!.History).IsCurrent);
    }
    [Fact]
    public void DocumentError_PreservesUnderlyingFailureForDiagnostics()
    {
        var cause = new InvalidOperationException("Test driver failure");
        var error = new DocumentException("PDF generation failed", 503, cause);
        Assert.Same(cause, error.InnerException);
        Assert.Contains("Test driver failure", error.ToString());
    }
    [Fact]
    public void VersionHash_IgnoresObjectOrderAndWhitespace()
    {
        Assert.Equal(DocumentVersion.Hash(JsonDocument.Parse("{\"a\":1.0,\"b\":2}").RootElement),
            DocumentVersion.Hash(JsonDocument.Parse("{ \"b\": 2, \"a\":1 }").RootElement));
    }
    [Fact]
    public void Html_EncodesUntrustedFields()
    {
        var html = DocumentHtml.Build(Sample(), new() { Attention = "<script>alert(1)</script>" }, Input().Strokes,
            "<img src=x>", DateTimeOffset.UtcNow, Guid.NewGuid(), "", new CompanyProfileOptions { EnglishName = "Aircon Service Management (Demo)" });
        Assert.DoesNotContain("<script>", html); Assert.Contains("&lt;script&gt;", html);
        Assert.DoesNotContain("<img src=x>", html); Assert.Contains("data:image/svg+xml;base64", html);
    }
    [Theory]
    [InlineData("quote", 2)]
    [InlineData("invoice", 2)]
    [InlineData("quote", 60)]
    [InlineData("invoice", 60)]
    public async Task PdfSmoke_WhenExplicitlyEnabled(string kind, int count)
    {
        var directory = Environment.GetEnvironmentVariable("SHENGHENG_PDF_QA_DIRECTORY");
        if (string.IsNullOrWhiteSpace(directory)) return;
        using var renderer = new PlaywrightDocumentPdfRenderer(
            Microsoft.Extensions.Options.Options.Create(
            new CompanyProfileOptions
            {
                ChineseName = "演示冷气服务公司",
                EnglishName = "Aircon Service Management (Demo)",
                RegistrationNumber = "DEMO ONLY",
                AddressLine1 = "Demo Address",
                AddressLine2 = "Malaysia",
                Phone = "N/A",
                Mobile = "N/A",
                ChineseDescription = "仅供演示",
                EnglishDescription = "For Demonstration Only",
                RepresentativeName = "Demo Representative"
            }));
        var bytes = await renderer.RenderAsync(Sample(kind, count), Input().Fields, Input().Strokes, "Demo Signer",
            new DateTimeOffset(2026, 10, 1, 4, 0, 0, TimeSpan.Zero), Guid.Parse("30000000-0000-0000-0000-000000000001"), TestContext.Current.CancellationToken);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(bytes.Take(8).ToArray()));
        await File.WriteAllBytesAsync(Path.Combine(directory, $"{kind}-signed-{count}.pdf"), bytes, TestContext.Current.CancellationToken);
    }
    private sealed class FakeRenderer : IDocumentPdfRenderer
    {
        public bool Called { get; private set; }
        public byte[] Bytes { get; } = Encoding.ASCII.GetBytes("%PDF-test");
        public Task<byte[]> RenderAsync(JsonElement snapshot, PrintFields fields, List<List<SignaturePoint>> strokes,
            string signerName, DateTimeOffset signedAt, Guid signatureId, CancellationToken ct)
        { Called = true; return Task.FromResult(Bytes); }
    }
    private sealed class FakeStore : IDocumentStore
    {
        public bool Owner { get; set; } = true;
        public JsonElement Current { get; set; } = Sample();
        public SignedDocument? Saved { get; private set; }
        private byte[] pdf = [];
        public Task<JsonElement?> SnapshotAsync(string kind, Guid id, CancellationToken ct) => Task.FromResult<JsonElement?>(Current);
        public Task<bool> IsOwnerAsync(Guid userId, CancellationToken ct) => Task.FromResult(Owner);
        public Task<string> OwnerNameAsync(Guid userId, CancellationToken ct) => Task.FromResult("Boss");
        public Task<IReadOnlyList<SignedDocument>> HistoryAsync(string kind, Guid id, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<SignedDocument>>(Saved is not null && Saved.Kind == kind && Saved.DocumentId == id ? [Saved] : []);
        public Task SaveAsync(SignedDocument document, byte[] bytes, CancellationToken ct)
        { Saved = document; pdf = bytes; return Task.CompletedTask; }
        public Task<byte[]> DownloadAsync(string path, CancellationToken ct) => Task.FromResult(pdf);
    }
}
