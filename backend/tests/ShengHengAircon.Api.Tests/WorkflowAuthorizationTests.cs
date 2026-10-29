using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class WorkflowAuthorizationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    public static IEnumerable<object[]> ProtectedRequests()
    {
        foreach (var role in new[] { "anonymous", "employee" })
        foreach (var route in new[] { "/api/quotes", "/api/invoices", "/api/expenses", "/api/customers", "/api/teams", "/api/users", "/api/activity-logs" })
            yield return [role, "GET", route];
        foreach (var role in new[] { "anonymous", "employee" })
        foreach (var route in new[] { "/api/quotes/10000000-0000-0000-0000-000000000001/invoice", "/api/quotes/10000000-0000-0000-0000-000000000001/job" })
            yield return [role, "POST", route];
        yield return ["employee", "PUT", "/api/jobs/10000000-0000-0000-0000-000000000001"];
        yield return ["employee", "DELETE", "/api/jobs/10000000-0000-0000-0000-000000000001"];
        yield return ["admin", "PUT", "/api/users/10000000-0000-0000-0000-000000000001/role"];
    }

    [Theory, MemberData(nameof(ProtectedRequests))]
    public async Task UnauthorizedWorkflowRequest_IsRejectedBeforeBusinessAccess(string role, string method, string route)
    {
        using var client = factory.CreateClient();
        if (role == "anonymous") client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        else client.DefaultRequestHeaders.Add("X-Test-Role", role);
        using var request = new HttpRequestMessage(new HttpMethod(method), route);
        if (method is "POST" or "PUT") request.Content = JsonContent.Create(new { });
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(role == "anonymous" ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden, response.StatusCode);
    }
}
