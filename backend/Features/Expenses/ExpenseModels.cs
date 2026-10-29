using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Expenses;

public sealed class ExpenseInput : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 1)]
    public string ExpenseNumber { get; set; } = "";

    [Required, StringLength(500, MinimumLength = 1)]
    public string Description { get; set; } = "";

    [Range(typeof(decimal), "0.01", "9999999999.99")]
    public decimal Amount { get; set; }

    public DateOnly ExpenseDate { get; set; }

    [Required, RegularExpression("^(pending|confirmed)$")]
    public string Status { get; set; } = "pending";

    [StringLength(5000)]
    public string? Notes { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (ExpenseDate == default)
        {
            yield return new ValidationResult("请填写费用日期。", [nameof(ExpenseDate)]);
        }

        if (decimal.Round(Amount, 2) != Amount)
        {
            yield return new ValidationResult("金额最多支持两位小数。", [nameof(Amount)]);
        }
    }
}

public sealed record ExpenseResponse(
    Guid Id,
    string ExpenseNumber,
    string Description,
    decimal Amount,
    DateOnly ExpenseDate,
    string Status,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public interface IExpenseRepository
{
    Task<IReadOnlyList<ExpenseResponse>> GetAllAsync(CancellationToken cancellationToken);
    Task<ExpenseResponse?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<ExpenseResponse> CreateAsync(ExpenseInput input, CancellationToken cancellationToken);
    Task<ExpenseResponse?> UpdateAsync(Guid id, ExpenseInput input, CancellationToken cancellationToken);
}
