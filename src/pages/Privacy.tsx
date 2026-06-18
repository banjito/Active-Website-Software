import React from "react";

const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          Last Updated: December 17, 2024
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              1. Introduction
            </h2>
            <p>
              AMP OS ("we," "our," or "us") is committed to protecting your
              privacy. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our
              application, including when you connect third-party services such
              as Intuit QuickBooks.
            </p>
            <p className="mt-4">
              Please read this Privacy Policy carefully. By using AMP OS, you
              consent to the data practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              2. Information We Collect
            </h2>

            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mt-6 mb-3">
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account registration information (name, email, password)</li>
              <li>Company and business information</li>
              <li>Job and project data</li>
              <li>Customer and contact information</li>
              <li>Communications with us</li>
            </ul>

            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mt-6 mb-3">
              2.2 Information from QuickBooks Integration
            </h3>
            <p>
              When you connect your QuickBooks Online account, we access the
              following data with your authorization:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Company Information:</strong> Business name, address,
                contact details, fiscal year settings
              </li>
              <li>
                <strong>Customer Data:</strong> Customer names, contact
                information, billing addresses
              </li>
              <li>
                <strong>Vendor Data:</strong> Vendor names and contact
                information
              </li>
              <li>
                <strong>Invoice Data:</strong> Invoice numbers, amounts, dates,
                line items, payment status
              </li>
              <li>
                <strong>Estimate Data:</strong> Estimate details and associated
                customer information
              </li>
              <li>
                <strong>Payment Data:</strong> Payment records, amounts, and
                dates
              </li>
              <li>
                <strong>Financial Reports:</strong> Profit and Loss statements,
                Balance Sheets, account balances
              </li>
              <li>
                <strong>Chart of Accounts:</strong> Account names, types, and
                balances
              </li>
            </ul>

            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mt-6 mb-3">
              2.3 Automatically Collected Information
            </h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Device and browser information</li>
              <li>IP address and location data</li>
              <li>Usage patterns and application interactions</li>
              <li>Log data and error reports</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              3. How We Use Your Information
            </h2>
            <p>We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Service Delivery:</strong> To provide, maintain, and
                improve AMP OS features and functionality
              </li>
              <li>
                <strong>Job Management:</strong> To sync job data with
                QuickBooks invoices and estimates
              </li>
              <li>
                <strong>Financial Reporting:</strong> To display financial
                dashboards and reports from your QuickBooks data
              </li>
              <li>
                <strong>Customer Sync:</strong> To synchronize customer
                information between AMP OS and QuickBooks
              </li>
              <li>
                <strong>Account Management:</strong> To manage your account and
                provide customer support
              </li>
              <li>
                <strong>Communications:</strong> To send service-related
                notifications and updates
              </li>
              <li>
                <strong>Security:</strong> To detect, prevent, and address
                technical issues and security threats
              </li>
              <li>
                <strong>Legal Compliance:</strong> To comply with applicable
                laws and regulations
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              4. Data Sharing and Disclosure
            </h2>
            <p>
              We do not sell your personal information or QuickBooks data. We
              may share information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Service Providers:</strong> With trusted third-party
                service providers who assist in operating our application (e.g.,
                hosting, analytics), subject to confidentiality agreements
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, legal
                process, or government request
              </li>
              <li>
                <strong>Protection of Rights:</strong> To protect our rights,
                privacy, safety, or property, and that of our users
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, or sale of assets, with appropriate notice
                to users
              </li>
              <li>
                <strong>With Your Consent:</strong> When you explicitly
                authorize us to share information
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              5. Data Security
            </h2>
            <p>
              We implement appropriate technical and organizational security
              measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Encryption of data in transit using TLS/SSL</li>
              <li>Secure storage of authentication tokens</li>
              <li>Access controls and authentication requirements</li>
              <li>Regular security assessments and updates</li>
              <li>
                Secure handling of QuickBooks OAuth tokens with automatic
                refresh
              </li>
            </ul>
            <p className="mt-4">
              While we strive to protect your information, no method of
              transmission over the Internet or electronic storage is 100%
              secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              6. Data Retention
            </h2>
            <p>
              We retain your information for as long as your account is active
              or as needed to provide services. QuickBooks data is cached
              temporarily to improve performance and is refreshed regularly from
              QuickBooks.
            </p>
            <p className="mt-4">
              When you disconnect your QuickBooks account or delete your AMP OS
              account:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>OAuth tokens are immediately invalidated and deleted</li>
              <li>Cached QuickBooks data is removed within 30 days</li>
              <li>
                Account data is retained for 90 days for recovery purposes, then
                permanently deleted
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              7. Your Rights and Choices
            </h2>
            <p>You have the following rights regarding your information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Access:</strong> Request a copy of the personal
                information we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate or
                incomplete information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal
                information
              </li>
              <li>
                <strong>Disconnect:</strong> Disconnect your QuickBooks account
                at any time through Application settings
              </li>
              <li>
                <strong>Export:</strong> Request export of your data in a
                portable format
              </li>
              <li>
                <strong>Opt-out:</strong> Opt out of marketing communications
              </li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us at support@ampos.io.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              8. QuickBooks-Specific Provisions
            </h2>
            <p>
              Our integration with Intuit QuickBooks is subject to additional
              requirements:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                We only access QuickBooks data that you explicitly authorize
              </li>
              <li>
                We use QuickBooks data solely for the purposes described in this
                policy
              </li>
              <li>
                We do not store your QuickBooks login credentials; we use secure
                OAuth 2.0 tokens
              </li>
              <li>
                You can revoke access at any time through AMP OS settings or
                your QuickBooks account
              </li>
              <li>
                We comply with Intuit's data handling and privacy requirements
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              9. Third-Party Links and Services
            </h2>
            <p>
              Our application may contain links to third-party websites or
              services, including QuickBooks. We are not responsible for the
              privacy practices of these third parties. We encourage you to
              review their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              10. Children's Privacy
            </h2>
            <p>
              AMP OS is not intended for children under 13 years of age. We do
              not knowingly collect personal information from children under 13.
              If we discover that a child under 13 has provided us with personal
              information, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              11. International Data Transfers
            </h2>
            <p>
              Your information may be transferred to and processed in countries
              other than your country of residence. These countries may have
              different data protection laws. By using AMP OS, you consent to
              such transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              12. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new Privacy
              Policy on this page and updating the "Last Updated" date. We
              encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              13. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy or our data
              practices, please contact us at:
            </p>
            <p className="mt-2">
              <strong>AMP OS</strong>
              <br />
              Email: support@ampos.io
              <br />
              Website: https://ampos.io
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              14. California Privacy Rights
            </h2>
            <p>
              If you are a California resident, you have additional rights under
              the California Consumer Privacy Act (CCPA), including the right to
              know what personal information we collect and how it is used, the
              right to delete your personal information, and the right to
              opt-out of the sale of your personal information (we do not sell
              personal information).
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            © {new Date().getFullYear()} AMP OS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
