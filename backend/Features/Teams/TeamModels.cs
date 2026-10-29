using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Teams;

public sealed class TeamInput
{
    [Required, StringLength(100, MinimumLength = 1)] public string Name { get; set; } = "";
    [StringLength(2000)] public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class EmployeeInput
{
    public Guid? TeamId { get; set; }
    [Required, StringLength(200, MinimumLength = 1)] public string Name { get; set; } = "";
    [StringLength(50)] public string? Phone { get; set; }
    [Required, StringLength(100, MinimumLength = 1)] public string Role { get; set; } = "技术员";
    [StringLength(2000)] public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed record EmployeeResponse(Guid Id, Guid? TeamId, string Name, string? Phone,
    string Role, string? Notes, bool IsActive, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record TeamResponse(Guid Id, string Name, string? Notes, bool IsActive,
    IReadOnlyList<EmployeeResponse> Employees, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public interface ITeamRepository
{
    Task<IReadOnlyList<TeamResponse>> GetAllAsync(CancellationToken cancellationToken);
    Task<TeamResponse> CreateTeamAsync(TeamInput input, CancellationToken cancellationToken);
    Task<TeamResponse?> UpdateTeamAsync(Guid id, TeamInput input, CancellationToken cancellationToken);
    Task<EmployeeResponse> CreateEmployeeAsync(Guid teamId, EmployeeInput input, CancellationToken cancellationToken);
    Task<EmployeeResponse?> UpdateEmployeeAsync(Guid id, EmployeeInput input, CancellationToken cancellationToken);
}
