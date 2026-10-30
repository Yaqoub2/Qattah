"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";

export function NetChart({
  data,
}: {
  data: { name: string; net: number; due: number; paid: number }[];
}) {
  const t = useTranslations("report");
  const paid = t("paid");
  const owed = t("owed");
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => [value, name === "paid" ? paid : name === "due" ? owed : String(name)]}
          />
          <Legend formatter={(value) => (value === "paid" ? paid : value === "due" ? owed : value)} />
          <Bar dataKey="paid" name={paid} fill="#0f766e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="due" name={owed} fill="#d97706" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
