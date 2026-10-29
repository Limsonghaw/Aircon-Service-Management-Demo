using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ShengHengAircon.Api.Features.Quotes;
using ShengHengAircon.Api.Options;
using Xunit;
using OptionFactory = Microsoft.Extensions.Options.Options;

namespace ShengHengAircon.Api.Tests;

public sealed class QuoteConversionRepositoryTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Conversion_SendsSourceIdAndTrimmedFieldsToExpectedRpc(bool job)
    {
        var targetId = Guid.NewGuid();
        var handler = new Handler(HttpStatusCode.OK, JsonContent.Create(targetId));
        using var http = new HttpClient(handler);
        var repository = Repository(http);
        var sourceId = Guid.NewGuid();
        var ct = TestContext.Current.CancellationToken;
        var result = job
            ? await repository.ConvertToJobAsync(sourceId, new() { JobNumber = " JOB-QA ", Title = " Installation ", ServiceDate = new(2026, 10, 2), Team = " A " }, ct)
            : await repository.ConvertToInvoiceAsync(sourceId, new() { InvoiceNumber = " INV-QA ", DueDate = new(2026, 10, 31) }, ct);
        Assert.Equal(targetId, result);
        Assert.Equal(HttpMethod.Post, handler.Method);
        Assert.Equal(job ? "/rest/v1/rpc/convert_quote_to_job" : "/rest/v1/rpc/convert_quote_to_invoice", handler.Path);
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal(sourceId, json.RootElement.GetProperty("p_quote_id").GetGuid());
        Assert.Equal(job ? "JOB-QA" : "INV-QA", json.RootElement.GetProperty(job ? "p_job_number" : "p_invoice_number").GetString());
        Assert.Equal(job ? "2026-10-02" : "2026-10-31", json.RootElement.GetProperty(job ? "p_service_date" : "p_due_date").GetString());
        if (job)
        {
            Assert.Equal("Installation", json.RootElement.GetProperty("p_title").GetString());
            Assert.Equal("A", json.RootElement.GetProperty("p_team").GetString());
        }
    }

    [Theory]
    [InlineData(false, "23505", 409)]
    [InlineData(true, "23505", 409)]
    [InlineData(false, "23514", 400)]
    [InlineData(true, "23514", 400)]
    public async Task DuplicateOrIneligibleQuote_ReturnsExplicitFailure(bool job, string code, int status)
    {
        using var http = new HttpClient(new Handler(code == "23505" ? HttpStatusCode.Conflict : HttpStatusCode.BadRequest, JsonContent.Create(new { code })));
        var failure = await Assert.ThrowsAsync<QuoteWriteException>(() => Convert(Repository(http), job));
        Assert.Equal(status, failure.StatusCode);
        Assert.Contains(code == "23505" ? "已存在" : "已接受", failure.Message);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingQuote_RemainsNullAndServiceFailureDoesNotBecomeSuccess(bool job)
    {
        using var missing = new HttpClient(new Handler(HttpStatusCode.OK, new StringContent("null")));
        Assert.Null(await Convert(Repository(missing), job));
        using var unavailable = new HttpClient(new Handler(HttpStatusCode.ServiceUnavailable, new StringContent("unavailable")));
        await Assert.ThrowsAsync<HttpRequestException>(() => Convert(Repository(unavailable), job));
    }

    private static SupabaseQuoteRepository Repository(HttpClient http) => new(http,
        OptionFactory.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_test" }));
    private static Task<Guid?> Convert(SupabaseQuoteRepository repository, bool job) => job
        ? repository.ConvertToJobAsync(Guid.NewGuid(), new() { JobNumber = "JOB-QA", Title = "Work", Team = "未安排", ServiceDate = new(2026, 10, 2) }, TestContext.Current.CancellationToken)
        : repository.ConvertToInvoiceAsync(Guid.NewGuid(), new() { InvoiceNumber = "INV-QA", DueDate = new(2026, 10, 31) }, TestContext.Current.CancellationToken);
    private sealed class Handler(HttpStatusCode status, HttpContent content) : HttpMessageHandler
    {
        public string? Path { get; private set; }
        public string? Body { get; private set; }
        public HttpMethod? Method { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Path = request.RequestUri!.AbsolutePath;
            Method = request.Method;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(status) { Content = content };
        }
    }
}
