/**
 * Public card pass page — /pass/[serial]
 * Displays QR code and Apple/Google Wallet add buttons for a loyalty card.
 * No auth required.
 */
import { Metadata } from "next";
import PassPageClient from "./PassPageClient";

export const metadata: Metadata = {
  title: "Add to Wallet",
  description: "Add your loyalty card to Apple or Google Wallet",
};

export default function PassPage({ params }: { params: { serial: string } }) {
  return <PassPageClient serial={params.serial} />;
}
