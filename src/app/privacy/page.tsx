import Link from 'next/link';
import { LegalPageLayout } from '@/components/LegalPageLayout';

export const revalidate = 3600;

const PRIVACY_TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'information-collected', label: 'Information We Collect' },
  { id: 'use', label: 'Use of Your Information' },
  { id: 'disclosure', label: 'Disclosure of Your Information' },
  { id: 'cookies', label: 'Cookies and Tracking Technologies' },
  { id: 'third-party', label: 'Third-Party Services' },
  { id: 'security', label: 'Security of Your Information' },
  { id: 'retention', label: 'Data Retention' },
  { id: 'international', label: 'International Data Transfers' },
  { id: 'your-rights', label: 'Your Rights and Choices' },
  { id: 'california', label: 'California Privacy Rights' },
  { id: 'children', label: 'Policy for Children' },
  { id: 'changes', label: 'Changes to This Policy' },
  { id: 'contact', label: 'Contact Us' },
];

const PrivacyPage = () => {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated="March 19, 2026"
      tableOfContents={PRIVACY_TOC}
    >
      <h2 id="overview">Overview</h2>
      <p>
        AITrader (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
        protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
        safeguard your information when you visit our website and use our services.
      </p>

      <h2 id="information-collected">Information We Collect</h2>
      <p>
        We may collect information about you in a variety of ways. The information we may
        collect includes:
      </p>
      <ul>
        <li>
          <strong>Personal Data:</strong> Personally identifiable information, such as your name,
          email address, and telephone number, that you voluntarily give to us when you register
          with our website or when you choose to participate in various activities related to our
          website.
        </li>
        <li>
          <strong>Derivative Data:</strong> Information our servers automatically collect when
          you access our website, such as your IP address, browser type, operating system, access
          times, and the pages you have viewed.
        </li>
        <li>
          <strong>Financial Data:</strong> Financial information, such as data related to your
          payment method (e.g., valid credit card number, card brand, expiration date) that we may
          collect when you purchase, order, exchange, or request information about our services.
        </li>
        <li>
          <strong>Account Data:</strong> Information associated with your account, including
          preferences, subscription status, usage history within our platform, and (when you sign
          in) coarse device type and limited browser metadata we store to support your account and
          improve security.
        </li>
      </ul>

      <h2 id="use">Use of Your Information</h2>
      <p>
        Having accurate information about you permits us to provide you with a smooth, efficient,
        and customized experience. Specifically, we may use information collected about you via
        our website to:
      </p>
      <ul>
        <li>Create and manage your account.</li>
        <li>Process payments and refunds.</li>
        <li>Deliver targeted advertising, newsletters, and other information regarding promotions and our website to you.</li>
        <li>Email you regarding your account or order.</li>
        <li>Fulfill and manage purchases, orders, payments, and other transactions related to our website.</li>
        <li>Increase the efficiency and operation of our website.</li>
        <li>Monitor and analyze usage and trends to improve your experience with our website.</li>
        <li>Notify you of updates to our website.</li>
        <li>Offer new products, services, and/or recommendations to you.</li>
        <li>Perform other business activities as needed.</li>
        <li>Prevent fraudulent transactions, monitor against theft, and protect against criminal activity.</li>
        <li>Request feedback and contact you about your use of our website.</li>
        <li>Resolve disputes and troubleshoot problems.</li>
        <li>Respond to product and customer service requests.</li>
        <li>Comply with legal obligations and enforce our Terms of Service.</li>
      </ul>

      <h2 id="disclosure">Disclosure of Your Information</h2>
      <p>
        We may share information we have collected about you in certain situations. Your
        information may be disclosed as follows:
      </p>
      <ul>
        <li>
          <strong>By Law or to Protect Rights:</strong> If we believe the release of information
          about you is necessary to respond to legal process, to investigate or remedy potential
          violations of our policies, or to protect the rights, property, and safety of others, we
          may share your information as permitted or required by any applicable law, rule, or
          regulation.
        </li>
        <li>
          <strong>Third-Party Service Providers:</strong> We may share your information with
          third parties that perform services for us or on our behalf, including payment processing
          (e.g., Stripe), data analysis, email delivery, hosting services, customer service, and
          marketing assistance.
        </li>
        <li>
          <strong>Marketing Communications:</strong> With your consent, or with an opportunity for
          you to withdraw consent, we may share your information with third parties for marketing
          purposes.
        </li>
        <li>
          <strong>Business Transfers:</strong> We may share or transfer your information in
          connection with, or during negotiations of, any merger, sale of company assets,
          financing, or acquisition of all or a portion of our business to another company.
        </li>
      </ul>

      <h2 id="cookies">Cookies and Tracking Technologies</h2>
      <p>
        We may use cookies, web beacons, and similar tracking technologies to collect information
        about your browsing activities. Cookies are small data files stored on your device that
        help us improve your experience, remember your preferences, and understand how you use
        our website.
      </p>
      <p>
        You can control cookies through your browser settings. Disabling cookies may affect the
        functionality of our website and your ability to use certain features.
      </p>

      <h2 id="third-party">Third-Party Services</h2>
      <p>
        Our website may contain links to third-party websites or integrate third-party services
        (e.g., authentication providers, analytics, payment processors). We are not responsible
        for the privacy practices of these third parties. We encourage you to review the privacy
        policies of any third-party services you access through our platform.
      </p>

      <h2 id="security">Security of Your Information</h2>
      <p>
        We use administrative, technical, and physical security measures to help protect your
        personal information. While we have taken reasonable steps to secure the personal
        information you provide to us, please be aware that despite our efforts, no security
        measures are perfect or impenetrable, and no method of data transmission can be guaranteed
        against any interception or other type of misuse.
      </p>

      <h2 id="retention">Data Retention</h2>
      <p>
        We retain your personal information for as long as necessary to fulfill the purposes
        described in this Privacy Policy, unless a longer retention period is required or
        permitted by law. When we no longer need your information, we will securely delete or
        anonymize it.
      </p>

      <h2 id="international">International Data Transfers</h2>
      <p>
        Your information may be transferred to and processed in countries other than your country
        of residence. These countries may have different data protection laws. By using our
        services, you consent to the transfer of your information to our facilities and to those
        third parties with whom we share it as described in this policy.
      </p>

      <h2 id="your-rights">Your Rights and Choices</h2>
      <p>
        You can review and change your personal information by logging into your account
        settings and updating your account. You may also send us an email to request access to,
        correct, or delete any personal information that you have provided to us.
      </p>
      <p>
        Depending on your jurisdiction, you may have additional rights, including the right to
        data portability, the right to restrict processing, the right to object to processing,
        and the right to withdraw consent. To exercise these rights, please contact us.
      </p>

      <h2 id="california">California Privacy Rights</h2>
      <p>
        If you are a California resident, you may have additional rights under the California
        Consumer Privacy Act (CCPA), including the right to know what personal information we
        collect, the right to delete personal information, the right to opt-out of the sale of
        personal information (we do not sell personal information), and the right to
        non-discrimination for exercising your privacy rights. To exercise these rights, please
        contact us.
      </p>

      <h2 id="children">Policy for Children</h2>
      <p>
        We do not knowingly solicit information from or market to children under the age of 13.
        If you become aware of any data we have collected from children under age 13, please
        contact us.
      </p>

      <h2 id="changes">Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of any changes
        by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot;
        date. You are advised to review this Privacy Policy periodically for any changes.
      </p>

      <h2 id="contact">Contact Us</h2>
      <p>
        If you have questions or comments about this Privacy Policy, please contact us at:{' '}
        <a href="mailto:tryaitrader@gmail.com" className="text-trader-blue hover:underline">
          tryaitrader@gmail.com
        </a>
      </p>
      <p>
        For more information about our practices, please also review our{' '}
        <Link href="/terms">Terms of Service</Link> and{' '}
        <Link href="/disclaimer">Disclaimer</Link>.
      </p>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
