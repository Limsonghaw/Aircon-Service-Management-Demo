using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Auth;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class AuthContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task ProtectedEndpoint_RequiresLogin()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/activity-logs");
        request.Headers.Add("X-Test-Anonymous", "true");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Employee_CannotReadManagementData()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/activity-logs");
        request.Headers.Add("X-Test-Role", UserRoles.Employee);

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Me_ReturnsAuthenticatedUser()
    {
        using var client = factory.CreateClient();

        var user = await client.GetFromJsonAsync<AuthUserResponse>(
            "/api/auth/me", TestContext.Current.CancellationToken);

        Assert.Equal("test@example.com", user?.Email);
        Assert.Equal(UserRoles.Owner, user?.Role);
    }

    [Fact]
    public async Task Login_CreatesProtectedCookieWithoutReturningPassword()
    {
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IUserAccessRepository>();
            services.AddSingleton<IUserAccessRepository>(new FakeRepository());
        }));
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        using var response = await client.PostAsJsonAsync("/api/auth/login",
            new { email = "owner@example.com", password = "correct-password" },
            TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("shengheng.session=", response.Headers.GetValues("Set-Cookie").Single());
        Assert.DoesNotContain("correct-password", body);
    }

    private sealed class FakeRepository : IUserAccessRepository
    {
        private static readonly AuthUserResponse User = new(
            Guid.Parse("10000000-0000-0000-0000-000000000001"),
            "owner@example.com", "Owner", UserRoles.Owner);

        public Task<AuthUserResponse?> AuthenticateAsync(
            string email, string password, CancellationToken cancellationToken) =>
            Task.FromResult<AuthUserResponse?>(User);

        public Task<IReadOnlyList<AuthUserResponse>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<AuthUserResponse>>([User]);

        public Task<AuthUserResponse?> ChangeRoleAsync(
            Guid id, string role, CancellationToken cancellationToken) =>
            Task.FromResult<AuthUserResponse?>(User with { Role = role });
    }
}
