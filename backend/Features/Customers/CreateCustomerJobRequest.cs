using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Customers;

public sealed class CreateCustomerJobRequest(
    string jobNumber,
    string title,
    DateOnly serviceDate,
    string team,
    string status)
{
    [Required, StringLength(50, MinimumLength = 1)]
    public string JobNumber { get; } = jobNumber;

    [Required, StringLength(200, MinimumLength = 1)]
    public string Title { get; } = title;

    public DateOnly ServiceDate { get; } = serviceDate;

    [Required, StringLength(100, MinimumLength = 1)]
    public string Team { get; } = team;

    [Required, RegularExpression("^(pending|scheduled|in_progress|completed)$")]
    public string Status { get; } = status;
}
