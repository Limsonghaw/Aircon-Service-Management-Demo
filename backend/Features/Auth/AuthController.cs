using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ShengHengAircon.Api.Features.Auth;

[ApiController, Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(
        LoginRequest request,
        [FromServices] IUserAccessRepository repository,
        CancellationToken cancellationToken)
    {
        try
        {
            var user = await repository.AuthenticateAsync(request.Email, request.Password, cancellationToken);
            if (user is null)
                return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "电邮或密码不正确。");

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.DisplayName),
                new Claim(ClaimTypes.Role, user.Role)
            };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal,
                new AuthenticationProperties { IsPersistent = true, AllowRefresh = true });
            return Ok(user);
        }
        catch (UserAccessException exception)
        {
            return Problem(statusCode: exception.StatusCode, detail: exception.Message);
        }
    }

    [Authorize, HttpGet("me")]
    public ActionResult<AuthUserResponse> Me() => Ok(CurrentUser());

    [Authorize, HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    private AuthUserResponse CurrentUser() => new(
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        User.FindFirstValue(ClaimTypes.Email)!,
        User.FindFirstValue(ClaimTypes.Name)!,
        User.FindFirstValue(ClaimTypes.Role)!);
}

[ApiController, Route("api/users"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class UsersController(IUserAccessRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AuthUserResponse>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await repository.GetAllAsync(cancellationToken));

    [HttpPut("{id:guid}/role"), Authorize(Policy = AuthorizationPolicies.Owner)]
    public async Task<IActionResult> ChangeRole(
        Guid id, ChangeUserRoleRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var user = await repository.ChangeRoleAsync(id, request.Role, cancellationToken);
            return user is null ? NotFound() : Ok(user);
        }
        catch (UserAccessException exception)
        {
            return Problem(statusCode: exception.StatusCode, detail: exception.Message);
        }
    }
}
