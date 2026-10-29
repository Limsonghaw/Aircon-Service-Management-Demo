using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Invoices;

internal static class InvoiceDocumentValidation
{
    public static IEnumerable<ValidationResult> Validate(List<InvoiceItem>? items, decimal discount)
    {
        if (items is null) { yield return new("明细不能为空。", ["Items"]); yield break; }
        if (decimal.Round(discount, 2) != discount)
            yield return new("折扣最多两位小数。", ["Discount"]);
        if (items.Any(item => decimal.Round(item.Quantity, 2) != item.Quantity || decimal.Round(item.UnitPrice, 2) != item.UnitPrice))
            yield return new("数量和单价最多两位小数。", ["Items"]);
        if (items.Count == 0 && discount != 0)
            yield return new("使用折扣前请填写明细。", ["Discount"]);
        if (items.Count > 0)
        {
            var total = items.Sum(item => decimal.Round(item.Quantity * item.UnitPrice, 2, MidpointRounding.AwayFromZero)) - discount;
            if (total <= 0 || total > 9999999999.99m)
                yield return new("折扣后的金额必须大于零且不超过金额上限。", ["Items", "Discount"]);
        }
    }
}
