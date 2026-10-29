using System.Net;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Quotes;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class QuoteListOrderingTests
{
    [Fact]
    public async Task DefaultOrderKeepsCreationDescendingAndAddsStableIdTieBreaker()
    {
        using var handler = new CaptureHandler();
        using var client = new HttpClient(handler);
        var repository = new SupabaseQuoteRepository(client, Microsoft.Extensions.Options.Options.Create(new SupabaseOptions
        {
            Enabled = true, Url = "https://isolated.example.test", ServiceRoleKey = "sb_test_only"
        }));
        var rows = await repository.GetAllAsync(TestContext.Current.CancellationToken);
        Assert.Empty(rows);
        Assert.Contains("order=created_at.desc,id.asc", handler.Url);
    }
    private sealed class CaptureHandler : HttpMessageHandler
    {
        public string Url { get; private set; } = "";
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Url = request.RequestUri!.ToString();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("[]", System.Text.Encoding.UTF8, "application/json") });
        }
    }
}
