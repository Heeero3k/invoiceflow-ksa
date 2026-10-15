import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { InlineBanner } from "@/components/ads/banner";
import { BatchCard } from "@/components/invoice-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, Row, ScrollScreen, SectionTitle } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { isBackendConfigured } from "@/lib/supabase";
import { radius, useTheme } from "@/lib/theme";
import { groupInvoices } from "@/shared/export/columns";
import { CATEGORY_LABELS } from "@/shared/invoice";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t, row, formatMoney, categoryLabel, isRTL } = useI18n();
  const { invoices, batches, jobs } = useStore();
  const { isSignedIn, displayName } = useAuth();

  const month = new Date().toISOString().slice(0, 7);
  const monthInvoices = useMemo(() => invoices.filter((invoice) => (invoice.issueDate || invoice.createdAt).startsWith(month)), [invoices, month]);
  const spend = monthInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const vat = monthInvoices.reduce((sum, invoice) => sum + invoice.vat, 0);
  const toReview = invoices.filter((invoice) => invoice.status === "needs-review");
  const categories = useMemo(() => groupInvoices(monthInvoices.length ? monthInvoices : invoices, (invoice) => invoice.category).slice(0, 4), [invoices, monthInvoices]);
  const maxCategory = Math.max(...categories.map((item) => item.total), 1);
  const hour = new Date().getHours();
  const firstReviewBatch = toReview[0]?.batchId;

  return (
    <ScrollScreen>
      <Row style={{ justifyContent: "space-between", paddingTop: 10, paddingBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {hour < 12 ? t("greetingMorning") : t("greetingEvening")}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {displayName ?? t("appName")}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/settings")} style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {displayName ? <Text variant="subheading">{displayName.charAt(0).toUpperCase()}</Text> : <Icon name="account-outline" size={22} color={colors.textMuted} />}
        </Pressable>
      </Row>

      <LinearGradient colors={[colors.heroFrom, colors.heroTo]} start={{ x: isRTL ? 1 : 0, y: 0 }} end={{ x: isRTL ? 0 : 1, y: 1 }} style={styles.hero}>
        <View style={[styles.heroRing, isRTL ? { left: -70 } : { right: -70 }]} />
        <Text variant="overline" style={{ color: "#D2B07A" }}>
          {t("spendThisMonth")}
        </Text>
        <Row gap={6} align="flex-end" style={{ marginTop: 6 }}>
          <Text variant="numberLarge" style={{ color: "#FFFFFF", fontSize: 32, lineHeight: 42 }}>
            {formatMoney(spend, false)}
          </Text>
          <Text variant="label" style={{ color: "#B9C0CC", marginBottom: 6 }}>
            {t("sar")}
          </Text>
        </Row>
        <Row style={{ marginTop: 18 }} gap={10}>
          <HeroStat label={t("vatThisMonth")} value={formatMoney(vat, false)} />
          <HeroStat label={t("thisMonth")} value={t("invoicesCount", { n: monthInvoices.length })} />
          <HeroStat label={t("toReview")} value={String(toReview.length)} highlight={toReview.length > 0} />
        </Row>
      </LinearGradient>

      {toReview.length > 0 ? (
        <Card tone="warning" style={{ marginTop: 14 }} onPress={() => (firstReviewBatch ? router.push(`/batch/${firstReviewBatch}`) : router.push(`/invoice/${toReview[0].id}`))}>
          <Row gap={12}>
            <View style={[styles.iconTile, { backgroundColor: colors.surface }]}>
              <Icon name="clipboard-check-outline" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{t("reviewQueueTitle", { n: toReview.length })}</Text>
              <Text variant="caption" tone="muted">
                {t("reviewQueueBody")}
              </Text>
            </View>
            <Text variant="label" tone="warning">
              {t("reviewNow")}
            </Text>
          </Row>
        </Card>
      ) : null}

      {!invoices.length && !jobs.length ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState icon="file-document-multiple-outline" title={t("emptyHomeTitle")} body={t("emptyHomeBody")} action={<Button title={t("scanCtaButton")} icon="line-scan" onPress={() => router.push("/scan")} />} />
        </Card>
      ) : (
        <Card style={{ marginTop: 14 }} onPress={() => router.push("/scan")}>
          <Row gap={12}>
            <View style={[styles.iconTile, { backgroundColor: colors.accentSoft }]}>
              <Icon name="layers-plus" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{t("scanCtaTitle")}</Text>
              <Text variant="caption" tone="muted">
                {t("scanCtaBody")}
              </Text>
            </View>
          </Row>
        </Card>
      )}

      {isBackendConfigured && !isSignedIn ? (
        <Pressable onPress={() => router.push("/sign-in")} style={({ pressed }) => [styles.signIn, { flexDirection: row, borderColor: colors.border }, pressed && { opacity: 0.85 }]}>
          <Icon name="cloud-lock-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{t("signInBannerTitle")}</Text>
            <Text variant="caption" tone="muted">
              {t("signInBannerBody")}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {batches.length ? (
        <>
          <SectionTitle title={t("recentBatches")} action={batches.length > 3 ? t("seeAll") : undefined} onAction={() => router.push("/invoices")} />
          {batches.slice(0, 3).map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              invoices={invoices.filter((invoice) => invoice.batchId === batch.id)}
              processing={jobs.filter((job) => job.batchId === batch.id && job.status !== "failed").length}
              onPress={() => router.push(`/batch/${batch.id}`)}
            />
          ))}
        </>
      ) : null}

      {categories.length ? (
        <>
          <SectionTitle title={t("topCategories")} />
          <Card>
            {categories.map((item, index) => (
              <View key={item.name} style={{ marginTop: index ? 14 : 0 }}>
                <Row style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <Row gap={8} style={{ flex: 1 }}>
                    <Icon name={CATEGORY_LABELS[item.name as keyof typeof CATEGORY_LABELS]?.icon ?? "tag-outline"} size={17} color={colors.textMuted} />
                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {categoryLabel(item.name as keyof typeof CATEGORY_LABELS)}
                    </Text>
                  </Row>
                  <Text variant="number" style={{ fontSize: 13 }}>
                    {formatMoney(item.total)}
                  </Text>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, flexDirection: row }}>
                  <View style={{ width: `${Math.max((item.total / maxCategory) * 100, 4)}%`, borderRadius: 3, backgroundColor: index === 0 ? colors.accent : colors.borderStrong }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <InlineBanner />
    </ScrollScreen>
  );
}

function HeroStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.heroStat, highlight && { backgroundColor: "rgba(210,176,122,0.18)" }]}>
      <Text variant="caption" style={{ color: "#9AA3B2", fontSize: 11 }} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="number" style={{ color: highlight ? "#E8CC98" : "#FFFFFF", fontSize: 14 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  hero: { borderRadius: radius.xl, padding: 20, overflow: "hidden" },
  heroRing: { position: "absolute", top: -90, width: 220, height: 220, borderRadius: 110, borderWidth: 26, borderColor: "rgba(210,176,122,0.08)" },
  heroStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  iconTile: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  signIn: { marginTop: 12, alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed" },
});
