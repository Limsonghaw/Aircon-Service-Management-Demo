using System.Buffers.Binary;
using System.Text;

namespace ShengHengAircon.Api.Features.Expenses;

public static class ReceiptFileValidation
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public static ReceiptUpload Validate(string fileName, string? suppliedType, byte[] bytes)
    {
        if (bytes.Length == 0) throw new ReceiptException("收据文件为空。", 400);
        if (bytes.Length > MaxBytes) throw new ReceiptException("收据文件不能超过 10 MB。", 413);
        var name = new string(fileName.Replace('\\', '/').Split('/')[^1].Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (name.Length is 0 or > 200) throw new ReceiptException("收据文件名需为 1 至 200 个字符。", 400);
        var extension = Path.GetExtension(name).ToLowerInvariant();
        var span = bytes.AsSpan();
        var type = extension switch
        {
            ".jpg" or ".jpeg" when span.Length >= 4 && span[0] == 0xff && span[1] == 0xd8 && span[2] == 0xff &&
                span[^2] == 0xff && span[^1] == 0xd9 => "image/jpeg",
            ".png" when span.Length >= 45 && span[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) &&
                BinaryPrimitives.ReadUInt32BigEndian(span[8..12]) == 13 && span[12..16].SequenceEqual("IHDR"u8) &&
                BinaryPrimitives.ReadUInt32BigEndian(span[16..20]) > 0 && BinaryPrimitives.ReadUInt32BigEndian(span[20..24]) > 0 &&
                span[^12..].SequenceEqual(new byte[] { 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 }) => "image/png",
            ".pdf" when span.StartsWith("%PDF-"u8) && Encoding.ASCII.GetString(span[Math.Max(0, span.Length - 1024)..]).TrimEnd().EndsWith("%%EOF", StringComparison.Ordinal) => "application/pdf",
            _ => throw new ReceiptException("只支持有效的 JPG、PNG 或 PDF 收据，请检查文件格式。", 400)
        };
        var declared = suppliedType?.Split(';')[0].Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(declared) && declared != "application/octet-stream" && declared != type)
            throw new ReceiptException("文件内容与上传格式不一致，请选择正确的收据文件。", 400);
        return new(name, type, type == "image/jpeg" ? ".jpg" : extension, bytes);
    }
}
