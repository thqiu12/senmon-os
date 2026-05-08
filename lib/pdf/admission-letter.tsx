import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

Font.register({
  family: "NotoSansJP",
  src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj757o.ttf",
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    backgroundColor: "#ffffff",
    padding: 60,
    fontSize: 10,
  },
  watermark: {
    position: "absolute",
    top: 220,
    left: 60,
    right: 60,
    textAlign: "center",
    fontSize: 72,
    color: "#f0f0f0",
    fontFamily: "NotoSansJP",
    transform: "rotate(-30deg)",
  },
  header: {
    marginBottom: 32,
    borderBottom: "2 solid #1e3a5f",
    paddingBottom: 16,
  },
  orgName: {
    fontSize: 11,
    color: "#1e3a5f",
    fontFamily: "NotoSansJP",
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 26,
    fontFamily: "NotoSansJP",
    color: "#1e3a5f",
    textAlign: "center",
    marginVertical: 20,
    letterSpacing: 6,
  },
  issueDateRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  issueDateText: {
    fontSize: 10,
    color: "#555",
  },
  recipientRow: {
    marginBottom: 28,
  },
  recipientName: {
    fontSize: 16,
    fontFamily: "NotoSansJP",
    color: "#111",
    marginBottom: 2,
  },
  recipientKana: {
    fontSize: 9,
    color: "#888",
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 2,
    color: "#333",
    marginBottom: 24,
    fontFamily: "NotoSansJP",
  },
  infoBox: {
    border: "1 solid #1e3a5f",
    borderRadius: 4,
    padding: 20,
    marginBottom: 28,
    backgroundColor: "#f8faff",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  infoLabel: {
    width: 120,
    fontSize: 10,
    color: "#555",
  },
  infoValue: {
    flex: 1,
    fontSize: 10,
    color: "#111",
    fontFamily: "NotoSansJP",
  },
  sealArea: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 32,
    alignItems: "center",
    gap: 12,
  },
  sealText: {
    fontSize: 10,
    color: "#333",
    textAlign: "right",
  },
  sealCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    border: "2 solid #1e3a5f",
    justifyContent: "center",
    alignItems: "center",
  },
  sealInner: {
    fontSize: 8,
    color: "#1e3a5f",
    textAlign: "center",
  },
  noteText: {
    fontSize: 9,
    color: "#888",
    marginTop: 24,
    lineHeight: 1.8,
    borderTop: "1 solid #eee",
    paddingTop: 12,
  },
  permitBox: {
    backgroundColor: "#f0fdf4",
    border: "2 solid #22c55e",
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  permitTitle: {
    fontSize: 12,
    color: "#166534",
    fontFamily: "NotoSansJP",
    marginBottom: 4,
  },
});

interface AdmissionLetterProps {
  type: string;
  applicationNo: string;
  applicantName: string;
  applicantNameKana: string;
  nationality: string;
  birthDate: string;
  schoolName: string;
  department: string;
  course: string;
  enrollmentYear: string;
  enrollmentMonth: string;
  issueDate: string;
  issuedBy: string;
}

export function AdmissionLetterPDF(props: AdmissionLetterProps) {
  const isPermit = props.type === "admission_permit";
  const docTitle = isPermit ? "入　学　許　可　書" : "合　格　通　知　書";

  const bodyText = isPermit
    ? `上記の者は、${props.schoolName}${props.department}科${props.course ? `（${props.course}）` : ""}への入学手続きが完了したことを確認し、${props.enrollmentYear}年${props.enrollmentMonth}月の入学を許可します。`
    : `上記の者は、${props.schoolName}${props.department}科${props.course ? `（${props.course}）` : ""}の入学選考の結果、合格と決定いたしましたので通知いたします。\n\n入学手続きの詳細については、別途ご案内いたします。期日までに所定の手続きを完了してください。`;

  return (
    <Document title={docTitle} author="入学審査委員会">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.issuedBy}</Text>
        </View>

        {/* Title */}
        <Text style={styles.docTitle}>{docTitle}</Text>

        {/* Issue date */}
        <View style={styles.issueDateRow}>
          <Text style={styles.issueDateText}>発行日：{props.issueDate}</Text>
        </View>

        {/* Recipient */}
        <View style={styles.recipientRow}>
          <Text style={styles.recipientName}>{props.applicantName}　殿</Text>
          <Text style={styles.recipientKana}>{props.applicantNameKana}</Text>
        </View>

        {/* Body */}
        <Text style={styles.bodyText}>{bodyText}</Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>申請番号</Text>
            <Text style={styles.infoValue}>{props.applicationNo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>氏名</Text>
            <Text style={styles.infoValue}>{props.applicantName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>国籍</Text>
            <Text style={styles.infoValue}>{props.nationality}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>生年月日</Text>
            <Text style={styles.infoValue}>{props.birthDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>志望校・学科</Text>
            <Text style={styles.infoValue}>
              {props.schoolName}　{props.department}{props.course ? `（${props.course}）` : ""}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>入学予定</Text>
            <Text style={styles.infoValue}>{props.enrollmentYear}年{props.enrollmentMonth}月</Text>
          </View>
        </View>

        {/* Seal area */}
        <View style={styles.sealArea}>
          <Text style={styles.sealText}>{props.issuedBy}</Text>
          <View style={styles.sealCircle}>
            <Text style={styles.sealInner}>{"公\n印"}</Text>
          </View>
        </View>

        {/* Note */}
        <Text style={styles.noteText}>
          {isPermit
            ? "※ 本書は入学許可の証明として発行するものです。在留資格の申請等にご利用いただけます。\n※ 本書の内容について不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。"
            : "※ 本通知は合格を証明するものではありません。正式な入学許可は入学手続き完了後に発行されます。\n※ 本書の内容について不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。"}
        </Text>
      </Page>
    </Document>
  );
}
