"use client";

import React, { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PrivacyPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
              <p className="text-gray-600 mb-12">Last updated: June 15, 2024</p>

              <div className="prose prose-lg max-w-none">
                <p>
                  AITrader ("we", "our", or "us") is committed to protecting your
                  privacy. This Privacy Policy explains how we collect, use,
                  disclose, and safeguard your information when you visit our
                  website and use our services.
                </p>

                <h2>Information We Collect</h2>
                <p>
                  We may collect information about you in a variety of ways. The
                  information we may collect includes:
                </p>
                <ul>
                  <li>
                    <strong>Personal Data:</strong> Personally identifiable
                    information, such as your name, email address, and telephone
                    number, that you voluntarily give to us when you register
                    with our website or when you choose to participate in
                    various activities related to our website.
                  </li>
                  <li>
                    <strong>Derivative Data:</strong> Information our servers
                    automatically collect when you access our website, such as
                    your IP address, browser type, operating system, access
                    times, and the pages you have viewed.
                  </li>
                  <li>
                    <strong>Financial Data:</strong> Financial information, such
                    as data related to your payment method (e.g., valid credit
                    card number, card brand, expiration date) that we may
                    collect when you purchase, order, exchange, or request
                    information about our services.
                  </li>
                </ul>

                <h2>Use of Your Information</h2>
                <p>
                  Having accurate information about you permits us to provide
                  you with a smooth, efficient, and customized experience.
                  Specifically, we may use information collected about you via
                  our website to:
                </p>
                <ul>
                  <li>Create and manage your account.</li>
                  <li>Process payments and refunds.</li>
                  <li>
                    Deliver targeted advertising, newsletters, and other
                    information regarding promotions and our website to you.
                  </li>
                  <li>Email you regarding your account or order.</li>
                  <li>
                    Fulfill and manage purchases, orders, payments, and other
                    transactions related to our website.
                  </li>
                  <li>Increase the efficiency and operation of our website.</li>
                  <li>
                    Monitor and analyze usage and trends to improve your
                    experience with our website.
                  </li>
                  <li>Notify you of updates to our website.</li>
                  <li>Offer new products, services, and/or recommendations to you.</li>
                  <li>Perform other business activities as needed.</li>
                  <li>
                    Prevent fraudulent transactions, monitor against theft, and
                    protect against criminal activity.
                  </li>
                  <li>Request feedback and contact you about your use of our website.</li>
                  <li>Resolve disputes and troubleshoot problems.</li>
                  <li>Respond to product and customer service requests.</li>
                </ul>

                <h2>Disclosure of Your Information</h2>
                <p>
                  We may share information we have collected about you in
                  certain situations. Your information may be disclosed as
                  follows:
                </p>
                <ul>
                  <li>
                    <strong>By Law or to Protect Rights:</strong> If we believe
                    the release of information about you is necessary to respond
                    to legal process, to investigate or remedy potential
                    violations of our policies, or to protect the rights,
                    property, and safety of others, we may share your
                    information as permitted or required by any applicable law,
                    rule, or regulation.
                  </li>
                  <li>
                    <strong>Third-Party Service Providers:</strong> We may share
                    your information with third parties that perform services
                    for us or on our behalf, including payment processing, data
                    analysis, email delivery, hosting services, customer
                    service, and marketing assistance.
                  </li>
                  <li>
                    <strong>Marketing Communications:</strong> With your
                    consent, or with an opportunity for you to withdraw consent,
                    we may share your information with third parties for
                    marketing purposes.
                  </li>
                  <li>
                    <strong>Business Transfers:</strong> We may share or
                    transfer your information in connection with, or during
                    negotiations of, any merger, sale of company assets,
                    financing, or acquisition of all or a portion of our
                    business to another company.
                  </li>
                </ul>

                <h2>Security of Your Information</h2>
                <p>
                  We use administrative, technical, and physical security
                  measures to help protect your personal information. While we
                  have taken reasonable steps to secure the personal information
                  you provide to us, please be aware that despite our efforts,
                  no security measures are perfect or impenetrable, and no
                  method of data transmission can be guaranteed against any
                  interception or other type of misuse.
                </p>

                <h2>Policy for Children</h2>
                <p>
                  We do not knowingly solicit information from or market to
                  children under the age of 13. If you become aware of any data
                  we have collected from children under age 13, please contact
                  us.
                </p>

                <h2>Options Regarding Your Information</h2>
                <p>
                  You can review and change your personal information by logging
                  into your account settings and updating your account. You may
                  also send us an email to request access to, correct, or delete
                  any personal information that you have provided to us.
                </p>

                <h2>Contact Us</h2>
                <p>
                  If you have questions or comments about this Privacy Policy,
                  please contact us at:{" "}
                  <a
                    href="mailto:tryaitrader@gmail.com"
                    className="text-trader-blue hover:underline"
                  >
                    tryaitrader@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPage;
