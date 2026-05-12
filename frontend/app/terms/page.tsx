export const metadata = {
  title: "Terms of Service | ChatCraft AI",
  description: "The terms and conditions governing your use of ChatCraft AI.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
        Terms of Service
      </h1>
      <p className="mb-10 text-sm text-gray-500">Last updated: 12 May 2026</p>

      <div className="prose prose-gray max-w-none space-y-10">
        <section>
          <h2 className="text-xl font-semibold text-gray-800">Acceptance of Terms</h2>
          <p className="mt-2 text-gray-600">
            By creating an account or using ChatCraft AI (the "Service"), you agree to be bound
            by these Terms of Service and our Privacy Policy. If you do not agree, you must not
            use the Service. We reserve the right to update these terms at any time; continued
            use after changes are posted constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Use of Service</h2>
          <p className="mt-2 text-gray-600">
            You are granted a limited, non-exclusive, non-transferable licence to access and use
            ChatCraft AI for your own business or personal purposes in accordance with these
            terms. You are responsible for maintaining the security of your account credentials
            and for all activity that occurs under your account.
          </p>
          <p className="mt-2 text-gray-600">
            Plans and features are subject to the usage limits described on our pricing page.
            Exceeding those limits may result in throttling or suspension until the next billing
            cycle.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Prohibited Activities</h2>
          <p className="mt-2 text-gray-600">
            You must not use ChatCraft AI to generate, distribute, or facilitate illegal content,
            harassment, spam, phishing, or any form of deception. You must not attempt to reverse
            engineer, scrape, or overload our infrastructure, or access any part of the Service
            except through the official API and interfaces we provide.
          </p>
          <p className="mt-2 text-gray-600">
            Violation of these prohibitions may result in immediate account termination without
            refund and, where appropriate, referral to law enforcement.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Intellectual Property</h2>
          <p className="mt-2 text-gray-600">
            All software, branding, and content comprising ChatCraft AI is the exclusive property
            of ChatCraft AI Ltd and is protected by copyright and other intellectual property
            laws. You retain ownership of the content and data you upload or create through the
            Service.
          </p>
          <p className="mt-2 text-gray-600">
            By uploading content you grant ChatCraft AI a limited licence to process and store
            that content solely for the purpose of delivering the Service to you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Limitation of Liability</h2>
          <p className="mt-2 text-gray-600">
            To the fullest extent permitted by applicable law, ChatCraft AI Ltd shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages,
            including loss of profits or data, arising from your use of or inability to use the
            Service.
          </p>
          <p className="mt-2 text-gray-600">
            Our total aggregate liability to you for any claims arising under these terms shall
            not exceed the amount you paid to us in the 12 months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Termination</h2>
          <p className="mt-2 text-gray-600">
            You may cancel your account at any time from your account settings. We may suspend
            or terminate your access immediately if you breach these terms, fail to pay applicable
            fees, or if we are required to do so by law. Upon termination, your right to use the
            Service ceases immediately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Governing Law</h2>
          <p className="mt-2 text-gray-600">
            These Terms of Service are governed by and construed in accordance with the laws of
            England and Wales. Any disputes arising under or in connection with these terms shall
            be subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">Contact</h2>
          <p className="mt-2 text-gray-600">
            If you have questions about these terms, please contact us at{" "}
            <a
              href="mailto:legal@chatcraft.ai"
              className="text-indigo-600 underline hover:text-indigo-800"
            >
              legal@chatcraft.ai
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
