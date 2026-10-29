using System.Security.Claims;

namespace ShengHengAircon.Api.Features.Auth;

public sealed class ActivityActorHandler(IHttpContextAccessor httpContextAccessor) : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated == true)
        {
            request.Headers.TryAddWithoutValidation("X-Actor-User-Id", user.FindFirstValue(ClaimTypes.NameIdentifier));
            request.Headers.TryAddWithoutValidation("X-Actor-Name", user.FindFirstValue(ClaimTypes.Name));
        }
        return base.SendAsync(request, cancellationToken);
    }
}
