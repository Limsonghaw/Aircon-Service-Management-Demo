using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

public static class DocumentHtml
{
    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
    private static string Text(JsonElement element, string key) => element.TryGetProperty(key, out var p) && p.ValueKind != JsonValueKind.Null ? p.ToString() : "";
    private static decimal Number(JsonElement e, string key) => e.TryGetProperty(key, out var p) && p.TryGetDecimal(out var value) ? value : 0;
    private static string Money(decimal v) => v.ToString("N2", CultureInfo.GetCultureInfo("en-MY"));
    public static string SignatureSvg(List<List<SignaturePoint>> strokes)
    {
        var svg = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 200\">");
        foreach (var stroke in strokes)
        {
            svg.Append("<polyline fill=\"none\" stroke=\"#142c38\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" points=\"");
            foreach (var p in stroke) svg.Append((p.X * 600).ToString("F2", CultureInfo.InvariantCulture)).Append(',')
                .Append((p.Y * 200).ToString("F2", CultureInfo.InvariantCulture)).Append(' ');
            svg.Append("\"/>");
        }
        return svg.Append("</svg>").ToString();
    }
    public static string Build(JsonElement snapshot, PrintFields f, List<List<SignaturePoint>> strokes,
        string signer, DateTimeOffset at, Guid id, string css, CompanyProfileOptions company)
    {
        var quote = Text(snapshot, "kind") == "quote";
        var doc = snapshot.GetProperty("document");
        var customer = snapshot.GetProperty("customer");
        var rows = new StringBuilder();
        decimal subtotal = 0;
        var items = snapshot.GetProperty("items");
        var i = 0;
        foreach (var item in items.EnumerateArray())
        {
            var qty = Number(item, "quantity");
            var price = Number(item, quote ? "unit_price" : "unitPrice");
            var amount = decimal.Round(qty * price, 2, MidpointRounding.AwayFromZero);
            subtotal += amount;
            rows.Append($"<tr><td>{++i}</td><td class='document-preserve'>{E(Text(item, "description"))}</td><td>{qty.ToString(CultureInfo.InvariantCulture)}</td><td>{Money(price)}</td><td>{Money(amount)}</td></tr>");
        }
        if (!quote && i == 0)
        {
            subtotal = Number(doc, "amount");
            var description = Text(doc, "notes");
            rows.Append($"<tr><td>1</td><td class='document-preserve'>{E(string.IsNullOrWhiteSpace(description) ? "Air-conditioning service" : description)}</td><td>1</td><td>{Money(subtotal)}</td><td>{Money(subtotal)}</td></tr>");
        }
        var discount = quote ? 0 : Number(doc, "discount");
        var total = quote ? subtotal : Number(doc, "amount");
        var number = Text(doc, quote ? "quote_number" : "invoice_number");
        var signature = Convert.ToBase64String(Encoding.UTF8.GetBytes(SignatureSvg(strokes)));
        return $$"""
        <!doctype html><html><head><meta charset="utf-8"><title>{{E(number)}}</title><style>{{css}}
        .document-signature-image{display:block;width:100%;height:65px;object-fit:contain;object-position:left}
        .document-signed-note{font-size:9px;color:#444;overflow-wrap:anywhere}
        .document-signatures .document-sign-line.signed{margin-top:8px}
        </style></head><body><div class="document-overlay"><article class="business-document {{(quote ? "document-quote" : "document-invoice")}}">
        <header class="document-letterhead">{{(quote ? "" : "<h2>Invoice / Cash Sale</h2>")}}
        <h1>{{E(company.ChineseName)}}</h1><h2>{{E(company.EnglishName)}}</h2><p>({{E(company.RegistrationNumber)}})</p>
        <p>{{E(company.AddressLine1)}}<br>{{E(company.AddressLine2)}}</p><p>TEL/FAX: {{E(company.Phone)}}&nbsp; H/P: {{E(company.Mobile)}}</p><p>{{E(company.ChineseDescription)}}</p><p>{{E(company.EnglishDescription)}}</p></header>
        <div class="document-parties"><div><strong>To: {{E(Text(customer, "name"))}}</strong><p class="document-preserve">{{E(Text(customer, "address"))}}</p>
        <p>Tel: {{E(Text(customer, "phone"))}}</p><p>{{E(Text(customer, "email"))}}</p>{{(string.IsNullOrEmpty(f.Attention) ? "" : $"<p>Attn: {E(f.Attention)}</p>")}}</div>
        <div><p>{{(quote ? "Ref" : "Bill No.")}}: <strong>{{E(number)}}</strong></p><p>Date: {{f.Date:yyyy-MM-dd}}</p>
        {{(string.IsNullOrEmpty(f.Reference) ? "" : $"<p>Ref / PO: {E(f.Reference)}</p>")}}
        <p>{{(quote ? "Valid until" : "Due date")}}: {{E(Text(doc, quote ? "valid_until" : "due_date"))}}</p></div></div>
        {{(quote ? "<h3>QUOTATION</h3><p>We are pleased to quote you the following:</p>" : "")}}
        <table class="document-items"><thead><tr><th>No.</th><th>{{(quote ? "Description" : "Materials Supplied / Work Description")}}</th><th>Quantity</th><th>Unit Price RM</th><th>Amount RM</th></tr></thead><tbody>{{rows}}</tbody></table>
        <div class="document-totals">{{(discount > 0 ? $"<p>Subtotal RM <strong>{Money(total + discount)}</strong></p><p>Discount RM <strong>{Money(discount)}</strong></p>" : "")}}<p>TOTAL RM <strong>{{Money(total)}}</strong></p></div>
        {{(quote && !string.IsNullOrEmpty(f.Term) ? $"<p>Term: {E(f.Term)}</p>" : "")}}
        {{(string.IsNullOrEmpty(Text(doc, "notes")) ? "" : $"<div class='document-notes'><strong>Remarks:</strong><p class='document-preserve'>{E(Text(doc, "notes"))}</p></div>")}}
        {{(quote ? "<p class='document-closing'>We hope our quotation meets your requirements and look forward to serving you. For further information, please contact us.</p>" : "")}}
        <footer class="document-signatures"><div><div><p>{{(quote ? "Yours faithfully," : "Company representative:")}}</p><p>{{E(company.EnglishName)}}</p></div><div>
        <img class="document-signature-image" alt="Owner signature" src="data:image/svg+xml;base64,{{signature}}"><div class="document-sign-line signed"></div>{{E(signer)}}</div>
        <p class="document-signed-note">Signed: {{at:yyyy-MM-dd HH:mm:ss}} UTC<br>Record: {{id:D}}</p>{{(!quote && !string.IsNullOrEmpty(f.ServiceMan) ? $"<p>Service Man: {E(f.ServiceMan)}</p>" : "")}}</div>
        <div><div><p>{{(quote ? "Kindly sign and chop to confirm the above quotation." : "Customer’s Signature / 公司盖章")}}</p></div><div><div class="document-signature-space"></div><div class="document-sign-line"></div>{{E(Text(customer, "name"))}}</div></div></footer>
        </article></div></body></html>
        """;
    }
}
