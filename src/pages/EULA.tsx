import React from "react";

const EULA: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
          End User License Agreement (EULA)
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          Last Updated: December 17, 2024
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using AMP OS ("the Application"), including any
              integrations with third-party services such as Intuit QuickBooks,
              you agree to be bound by this End User License Agreement
              ("Agreement"). If you do not agree to these terms, do not use the
              Application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              2. License Grant
            </h2>
            <p>
              Subject to the terms of this Agreement, AMP OS grants you a
              limited, non-exclusive, non-transferable, revocable license to use
              the Application for your internal business purposes. This license
              does not include the right to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Modify, copy, or create derivative works of the Application
              </li>
              <li>
                Reverse engineer, decompile, or disassemble the Application
              </li>
              <li>Rent, lease, lend, sell, or sublicense the Application</li>
              <li>Use the Application for any unlawful purpose</li>
              <li>
                Remove or alter any proprietary notices on the Application
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              3. QuickBooks Integration
            </h2>
            <p>
              The Application integrates with Intuit QuickBooks Online to
              provide accounting and financial management features. By using
              this integration, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                You authorize AMP OS to access your QuickBooks data on your
                behalf, including but not limited to company information,
                customers, invoices, estimates, payments, and financial reports.
              </li>
              <li>
                You are responsible for maintaining the confidentiality of your
                QuickBooks credentials and for all activities that occur under
                your account.
              </li>
              <li>
                The integration is subject to Intuit's Terms of Service and you
                agree to comply with all applicable Intuit policies.
              </li>
              <li>
                AMP OS is not responsible for any changes, interruptions, or
                discontinuation of QuickBooks services by Intuit.
              </li>
              <li>
                You may disconnect your QuickBooks account at any time through
                the Application settings.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              4. Data Usage and Storage
            </h2>
            <p>
              When you connect your QuickBooks account, we access and store
              certain data to provide our services:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Company profile and business information</li>
              <li>Customer and vendor records</li>
              <li>Invoice and estimate data</li>
              <li>Payment and transaction history</li>
              <li>Financial reports (Profit & Loss, Balance Sheet)</li>
              <li>Account and chart of accounts information</li>
            </ul>
            <p className="mt-4">
              This data is used solely to provide the features and functionality
              of AMP OS, including job management, financial tracking, and
              reporting. We do not sell your data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              5. User Responsibilities
            </h2>
            <p>You agree to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Provide accurate and complete information when using the
                Application
              </li>
              <li>Maintain the security of your account credentials</li>
              <li>
                Promptly notify us of any unauthorized access to your account
              </li>
              <li>
                Use the Application in compliance with all applicable laws and
                regulations
              </li>
              <li>
                Not use the Application to transmit harmful, fraudulent, or
                illegal content
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              6. Intellectual Property
            </h2>
            <p>
              The Application, including all content, features, and
              functionality, is owned by AMP OS and is protected by copyright,
              trademark, and other intellectual property laws. QuickBooks is a
              registered trademark of Intuit Inc.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              7. Disclaimer of Warranties
            </h2>
            <p>
              THE APPLICATION IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT
              NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR
              A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
              THE APPLICATION WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              8. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, AMP OS SHALL NOT BE LIABLE
              FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR
              BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO YOUR USE OF
              THE APPLICATION OR THE QUICKBOOKS INTEGRATION.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              9. Termination
            </h2>
            <p>
              We may terminate or suspend your access to the Application at any
              time, with or without cause, with or without notice. Upon
              termination, your right to use the Application will immediately
              cease. You may terminate your use of the Application at any time
              by discontinuing use and disconnecting any integrated services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              10. Changes to This Agreement
            </h2>
            <p>
              We reserve the right to modify this Agreement at any time. We will
              notify users of any material changes by posting the updated
              Agreement on our website. Your continued use of the Application
              after such changes constitutes acceptance of the modified
              Agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              11. Governing Law
            </h2>
            <p>
              This Agreement shall be governed by and construed in accordance
              with the laws of the State of Texas, without regard to its
              conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mt-8 mb-4">
              12. Contact Information
            </h2>
            <p>
              If you have any questions about this Agreement, please contact us
              at:
            </p>
            <p className="mt-2">
              <strong>AMP OS</strong>
              <br />
              Email: support@ampos.io
              <br />
              Website: https://ampos.io
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

export default EULA;
