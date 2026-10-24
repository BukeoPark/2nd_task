import { createContext } from "react";

/** 리포트 작성일 — 있으면 모든 쪽 머리줄 오른쪽 끝에 쪽 번호와 함께 보인다. */
export const ReportDateContext = createContext<string | null>(null);
