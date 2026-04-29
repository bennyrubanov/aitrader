import Link from 'next/link';
import { LegalPageLayout } from '@/components/LegalPageLayout';

export const revalidate = 3600;

const TERMS_TOC = [
  { id: 'agreement', label: 'Agreement to Terms' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'representations', label: 'User Representations' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'user-account', label: 'User Account' },
  { id: 'purchases', label: 'Purchases and Payment' },
  { id: 'subscription', label: 'Subscription Services' },
  { id: 'fees', label: 'Fee Changes' },
  { id: 'risk', label: 'Risk Disclosure' },
  { id: 'market-data', label: 'Market Data' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'indemnification', label: 'Indemnification' },
  { id: 'termination', label: 'Termination' },
  { id: 'changes', label: 'Changes to Terms' },
  { id: 'arbitration', label: 'Mandatory Arbitration and Venue' },
  { id: 'contact', label: 'Contact Information' },
];

const TermsPage = () => {
  return (
    <LegalPageLayout
      title="Terms of Service"
      lastUpdated="March 19, 2026"
      tableOfContents={TERMS_TOC}
    >
      <h2 id="agreement">Agreement to Terms</h2>
      <p>
        These Terms of Service constitute a legally binding agreement made between you and
        AITrader, concerning your access to and use of our website and services. By accessing our
        website and using our services, you agree to be bound by these Terms of Service. If you do
        not agree, you may not use the platform or services.
      </p>

      <h2 id="disclaimer">Disclaimer</h2>
      <p>
        You acknowledge and agree to our{' '}
        <Link href="/disclaimer">Disclaimer</Link>, which is incorporated by reference into these
        Terms of Service. The Disclaimer contains important disclosures regarding the nature of
        our services, AI-generated analysis, limitations on investment advice, and your
        responsibilities when using AITrader. Please read and understand the Disclaimer before
        using our platform.
      </p>

      <h2 id="representations">User Representations</h2>
      <p>By using our services, you represent and warrant that:</p>
      <ul>
        <li>You have the legal capacity to enter into these Terms of Service.</li>
        <li>You are at least 18 years old.</li>
        <li>You will not use our services for any illegal or unauthorized purpose.</li>
        <li>Your use of our services will not violate any applicable law or regulation.</li>
      </ul>

      <h2 id="intellectual-property">Intellectual Property Rights</h2>
      <p>
        Unless otherwise indicated, our website and its contents are the property of AITrader and
        are protected by copyright, trademark, and other intellectual property laws. You are
        granted a limited license to access and use our website and its content for personal,
        non-commercial use.
      </p>

      <h2 id="user-account">User Account</h2>
      <p>
        If you create an account with us, you are responsible for maintaining the confidentiality
        of your account and password and for restricting access to your account. You agree to
        accept responsibility for all activities that occur under your account.
      </p>

      <h2 id="purchases">Purchases and Payment</h2>
      <p>
        We accept various forms of payment for our services. You agree to provide current,
        complete, and accurate purchase and account information for all purchases made via our
        website. You further agree to promptly update account and payment information, including
        email address, payment method, and payment card expiration date, so that we can complete
        your transactions and contact you as needed.
      </p>

      <h2 id="subscription">Subscription Services</h2>
      <p>
        Your subscription to our services will continue until terminated. To cancel your
        subscription, contact us at least 24 hours before the end of your current billing
        period to avoid being charged for the next period.
      </p>

      <h2 id="fees">Fee Changes</h2>
      <p>
        We reserve the right to adjust pricing for our services at any time. We will provide
        reasonable notice of any change in fees.
      </p>

      <h2 id="risk">Risk Disclosure</h2>
      <p>
        Investing in financial markets involves risk. The value of your investments can go down
        as well as up, and you may get back less than you invest. Past performance is not
        indicative of future results. The AI-powered insights and recommendations provided by
        our service are based on algorithmic analysis and may not always be accurate or
        profitable.
      </p>

      <h2 id="market-data">Market Data</h2>
      <p>
        The market data and information provided through our services is obtained from sources
        believed to be reliable, but we cannot guarantee its accuracy, completeness, or
        timeliness. We are not responsible for any errors or omissions in this information.
      </p>

      <h2 id="liability">Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by applicable law, in no event will AITrader, its
        affiliates, or its licensors be liable for any indirect, consequential, exemplary,
        incidental, special, or punitive damages, including lost profits, even if AITrader has
        been advised of the possibility of such damages.
      </p>

      <h2 id="indemnification">Indemnification</h2>
      <p>
        You agree to defend, indemnify, and hold us harmless from and against any claims,
        liabilities, damages, losses, and expenses, arising out of or in any way connected with
        your access to or use of our services, or your violation of these Terms of Service.
      </p>

      <h2 id="termination">Termination</h2>
      <p>
        We reserve the right to terminate or suspend your account and access to our services at
        our sole discretion, without notice, for conduct that we believe violates these Terms of
        Service or is harmful to other users of our services, us, or third parties, or for any
        other reason.
      </p>

      <h2 id="changes">Changes to Terms</h2>
      <p>
        We reserve the right to update or modify these Terms of Service at any time without
        prior notice. Your continued use of our services following any changes indicates your
        acceptance of the new terms.
      </p>

      <h2 id="arbitration">Mandatory Arbitration and Venue</h2>
      <p>
        You agree that any dispute, claim, or controversy arising out of or relating to these
        Terms or your use of the services will be resolved by final and binding arbitration on
        an individual basis, and not in a class, consolidated, or representative action. Any
        arbitration will take place in Texas, in a venue determined by AITrader, and under
        rules determined by AITrader, to the fullest extent permitted by applicable law.
      </p>

      <h2 id="contact">Contact Information</h2>
      <p>
        Questions about the Terms of Service should be sent to us at:{' '}
        <a href="mailto:tryaitrader@gmail.com" className="text-trader-blue hover:underline">
          tryaitrader@gmail.com
        </a>
      </p>
    </LegalPageLayout>
  );
};

export default TermsPage;
