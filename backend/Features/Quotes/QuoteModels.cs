using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Quotes;

public sealed class QuoteInput : IValidatableObject
{
    [Required, StringLength(50)] public string QuoteNumber { get; set; } = "";
    public Guid CustomerId { get; set; }
    public DateOnly ValidUntil { get; set; }
    [Required, RegularExpression("^(draft|sent|accepted|rejected)$")]
    public string Status { get; set; } = "draft";
    [StringLength(5000)] public string? Notes { get; set; }
    [Required, MinLength(1), MaxLength(100)] public List<QuoteItemInput> Items { get; set; } = [];
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (CustomerId == Guid.Empty) yield return new("请选择客户。", [nameof(CustomerId)]);
        if (ValidUntil == default) yield return new("请填写有效期。", [nameof(ValidUntil)]);
    }
}

public sealed class QuoteItemInput : IValidatableObject
{
    [Required, StringLength(1000)] public string Description { get; set; } = "";
    [Range(typeof(decimal), "0.01", "1000000")] public decimal Quantity { get; set; }
    [Range(typeof(decimal), "0", "9999999999.99")] public decimal UnitPrice { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (decimal.Round(Quantity, 2) != Quantity || decimal.Round(UnitPrice, 2) != UnitPrice)
            yield return new("数量和单价最多支持两位小数。", [nameof(Quantity), nameof(UnitPrice)]);
    }
}
public sealed record QuoteItemResponse(Guid Id, string Description, decimal Quantity, decimal UnitPrice)
{
    public decimal Subtotal => decimal.Round(Quantity * UnitPrice, 2, MidpointRounding.AwayFromZero);
}
public sealed record QuoteResponse(Guid Id, string QuoteNumber, Guid CustomerId, string CustomerName,
    DateOnly ValidUntil, string Status, string? Notes, IReadOnlyList<QuoteItemResponse> Items,
    Guid? InvoiceId = null, Guid? JobId = null)
{
    public decimal Total => Items.Sum(item => item.Subtotal);
}
public interface IQuoteRepository
{
    Task<QuoteResponse?> UpdateStatusAsync(Guid id, string status, CancellationToken ct);
    Task<IReadOnlyList<QuoteResponse>> GetAllAsync(CancellationToken ct);
    Task<QuoteResponse?> GetAsync(Guid id, CancellationToken ct);
    Task<QuoteResponse?> SaveAsync(Guid? id, QuoteInput input, CancellationToken ct);
    Task<Guid?> ConvertToInvoiceAsync(Guid id, ConvertQuoteToInvoiceRequest input, CancellationToken ct);
    Task<Guid?> ConvertToJobAsync(Guid id, ConvertQuoteToJobRequest input, CancellationToken ct);
}

public sealed class UpdateQuoteStatusRequest
{
    [Required, RegularExpression("^(draft|sent|accepted|rejected)$")]
    public string Status { get; set; } = "";
}

public sealed class ConvertQuoteToInvoiceRequest : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 1)] public string InvoiceNumber { get; set; } = "";
    public DateOnly DueDate { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (DueDate == default) yield return new("请填写到期日。", [nameof(DueDate)]);
    }
}

public sealed class ConvertQuoteToJobRequest : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 1)] public string JobNumber { get; set; } = "";
    [Required, StringLength(200, MinimumLength = 1)] public string Title { get; set; } = "";
    public DateOnly ServiceDate { get; set; }
    [Required, StringLength(100, MinimumLength = 1)] public string Team { get; set; } = "未安排";
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (ServiceDate == default) yield return new("请填写服务日期。", [nameof(ServiceDate)]);
    }
}

public sealed record QuoteConversionResponse(Guid Id);
