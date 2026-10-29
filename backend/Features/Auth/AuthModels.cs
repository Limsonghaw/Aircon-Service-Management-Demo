using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Auth;

public sealed class LoginRequest
{
    [Required, EmailAddress, StringLength(320)] public string Email { get; set; } = "";
    [Required, StringLength(200, MinimumLength = 6)] public string Password { get; set; } = "";
}

public sealed class ChangeUserRoleRequest
{
    [Required, RegularExpression("^(owner|admin|employee)$")]
    public string Role { get; set; } = UserRoles.Employee;
}

public sealed record AuthUserResponse(Guid Id, string Email, string DisplayName, string Role);

public interface IUserAccessRepository
{
    Task<AuthUserResponse?> AuthenticateAsync(string email, string password, CancellationToken cancellationToken);
    Task<IReadOnlyList<AuthUserResponse>> GetAllAsync(CancellationToken cancellationToken);
    Task<AuthUserResponse?> ChangeRoleAsync(Guid id, string role, CancellationToken cancellationToken);
}

public sealed class UserAccessException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
