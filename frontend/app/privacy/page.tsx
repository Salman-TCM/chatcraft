import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Privacy Policy | ${APP_NAME}`,
  description: `How ${APP_NAME} collects, uses, and protects your personal data.`,
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm text-gray-500">Last updated: 12 May 2026</p>

      <div className="prose prose-gray max-w-none space-y-10">
        <section>
          <h2 className="text-xl font-semibold text-gray-800">Data We Collect</h2>
          <p className="mt-2 text-gray-600">
            We collect information you provide directly, such as your name, email address, and
            payment details when you register or subscribe to {APP_NAME}. We also collect
            usage data automatically, including IP addresses, browser type, pages visited, and
            interactions with chatbot widgets you create. This data helps us operate, improve,
            and secure the platform.
          </p>
          <p className="mt-2 text-gray-600">
            When you build and deploy chatbots, conversation transcripts and the messages sent
            by end-users are stored to provide the service and generate analytics. We do not
            sell personal data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">How We Use Your Data</h2>
          <p className="mt-2 text-gray-600">
            Your data is used to provide and improve {APP_NAME}, process payments, send
            transactional emails (e.g. invoices, password resets), and detect abuse or
            fraudulent activity. We may use aggregated, anonymised analytics to understand
            feature adoption and guide product development.
          </p>
          <p className="mt-2 text-gray-600">
            We will only send marketing communications if you have given explicit consent, and
            you may withdraw that consent at any time via the unsubscribe link in any marketing
            email or through your account settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Data Retention</h2>
          <p className="mt-2 text-gray-600">
            Operational and usage logs are retained for 90 days, after which they are
            automatically purged. Financial records, including payment history and invoices,
            are retained for 7 years to comply with applicable tax and accounting regulations.
          </p>
          <p className="mt-2 text-gray-600">
            Account data is retained for as long as your account is active. If you delete your
            account, your personal data will be removed within 30 days except where retention
            is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Your Rights (GDPR)</h2>
          <p className="mt-2 text-gray-600">
            Under the General Data Protection Regulation (GDPR) you have the right of access
            to all personal data we hold about you, which you can exercise by requesting a
            full data export from your account settings at any time.
          </p>
          <p className="mt-2 text-gray-600">
            You have the right to erasure (the "right to be forgotten") — you may delete your
            account and all associated data permanently from your account settings. You also
            have the right to data portability: your export is provided in machine-readable
            JSON format so you can transfer it to another service.
          </p>
          <p className="mt-2 text-gray-600">
            Additional rights include rectification (correcting inaccurate data), restriction
            of processing, and the right to object to processing based on legitimate interests.
            To exercise any right, contact us at the address below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Contact Us</h2>
          <p className="mt-2 text-gray-600">
            For any privacy-related questions, data requests, or to contact our Data Protection
            Officer, please email{" "}
            <a
              href="mailto:privacy@chatcraft.ai"
              className="text-indigo-600 underline hover:text-indigo-800"
            >
              privacy@chatcraft.ai
            </a>
            . We aim to respond to all requests within 30 days.
          </p>
        </section>
      </div>
    </main>
  );
}
