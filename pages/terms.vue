<script setup>
definePageMeta({ layout: false })

const title = 'Terms of Service - Markit'
const description = 'Terms of Service for Markit platform operated by Flobit Technologies Private Limited.'

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description
})
</script>

<template>
  <UPage>
    <UContainer class="py-10 max-w-4xl">

      <!-- HEADER -->
      <div class="text-center mb-12">
        <h1 class="text-4xl font-bold text-[#097D4C]">
          Terms of Service
        </h1>

        <p class="text-xl font-semibold mt-4">
          Flobit Technologies Private Limited
        </p>

        <div class="mt-6 text-gray-600 text-sm">
          <p><strong>Effective Date:</strong> December 17, 2025</p>
          <p><strong>Last Updated:</strong> December 17, 2025</p>
        </div>
      </div>

      <!-- 1 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">1. Agreement to Terms</h2>
        </template>

        <p>
          These Terms of Service (“Terms”) constitute a legally binding agreement between you (“User”, “you”)
          and <strong>Flobit Technologies Private Limited</strong> (“Company”, “Markit”, “we”, “us”, “our”).
        </p>

        <p class="mt-3">
          By accessing or using the Markit platform, including website, mobile applications, and services,
          you agree to comply with and be bound by these Terms.
        </p>

        <p class="mt-3">
          If you do not agree with any part of these Terms, you must not access or use our services.
        </p>
      </UCard>

      <!-- 2 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">2. Eligibility</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>You must be at least 18 years old to use the platform.</li>
          <li>You must have the legal capacity to enter into a binding agreement.</li>
          <li>You agree to provide accurate and complete information during registration.</li>
        </ul>

        <p class="mt-3">
          If you are using Markit on behalf of a business, you confirm that you have authority
          to bind that entity to these Terms.
        </p>
      </UCard>

      <!-- 3 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">3. Platform Overview</h2>
        </template>

        <p>
          Markit is a technology platform that connects customers with local retailers and businesses.
        </p>

        <p class="mt-3">
          We provide tools and services including but not limited to:
        </p>

        <ul class="list-disc ml-6 mt-2 space-y-1">
          <li>Product discovery and ordering</li>
          <li>Try-at-Home shopping experience</li>
          <li>Product booking and reservation</li>
          <li>Instant local delivery services</li>
          <li>Billing and ERP tools for businesses</li>
        </ul>

        <p class="mt-3">
          Markit acts as an intermediary platform and does not manufacture, own, or directly sell products listed by retailers.
        </p>
      </UCard>

      <!-- 4 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">4. User Accounts</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>You are responsible for maintaining confidentiality of your account credentials.</li>
          <li>You agree not to share your account with others.</li>
          <li>You must notify us immediately of any unauthorized access.</li>
          <li>We reserve the right to suspend or terminate accounts for suspicious activity.</li>
        </ul>

        <p class="mt-3">
          You are fully responsible for all activities conducted through your account.
        </p>
      </UCard>

      <!-- 5 -->
      <UCard class="mb-6 border-l-4 border-[#097D4C]">
        <template #header>
          <h2 class="font-semibold text-lg">5. Try-at-Home Service</h2>
        </template>

        <p>
          Markit provides a “Try-at-Home” feature that allows users to receive products,
          evaluate them, and purchase selected items.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>You must return all unpurchased items immediately during pickup.</li>
          <li>Products must be returned in original condition.</li>
          <li>Any damage, loss, or misuse may result in full charge.</li>
          <li>Repeated misuse may lead to account suspension.</li>
        </ul>

        <p class="mt-3 font-medium text-[#097D4C]">
          Markit reserves the right to restrict or deny Try-at-Home access based on risk assessment.
        </p>
      </UCard>

      <!-- 6 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">6. Booking & Orders</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>You may reserve products through booking features.</li>
          <li>Bookings may require partial or full advance payment.</li>
          <li>Orders are subject to availability and retailer confirmation.</li>
          <li>Markit is not responsible for stock inaccuracies.</li>
        </ul>

        <p class="mt-3">
          Retailers may cancel orders due to stock or operational constraints.
        </p>
      </UCard>

      <!-- 7 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">7. Payments</h2>
        </template>

        <p>
          All payments made through Markit are processed via third-party payment gateways.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>We do not store your card or banking details.</li>
          <li>Payment failures may occur due to bank or network issues.</li>
          <li>You agree to pay all applicable charges including taxes.</li>
          <li>Invoices may be generated by the retailer or Markit.</li>
        </ul>

        <p class="mt-3">
          Markit is not responsible for delays caused by payment providers.
        </p>
      </UCard>

      <!-- 8 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">8. Cancellation & Refunds</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>Orders may be cancelled before dispatch.</li>
          <li>Refunds are processed based on retailer policies.</li>
          <li>Refund timelines depend on payment providers.</li>
          <li>Try-at-Home adjustments are done instantly at pickup.</li>
        </ul>

        <p class="mt-3">
          Markit acts as a facilitator and does not guarantee refund timelines.
        </p>
      </UCard>

      <!-- 9 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">9. Delivery & Logistics</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>Delivery timelines are estimates and not guaranteed.</li>
          <li>Delays may occur due to traffic, weather, or operational issues.</li>
          <li>You must be available to receive deliveries.</li>
          <li>Failed deliveries may result in cancellation or extra charges.</li>
        </ul>

        <p class="mt-3">
          Delivery services may be handled by third-party logistics providers.
        </p>
      </UCard>

      <!-- 10 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">10. User Responsibilities</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>You agree not to misuse the platform.</li>
          <li>You will not engage in fraudulent or illegal activities.</li>
          <li>You will not attempt to harm the platform or other users.</li>
          <li>You will provide accurate delivery and contact details.</li>
        </ul>

        <p class="mt-3">
          Violation of these responsibilities may result in account suspension or legal action.
        </p>
      </UCard>

      <!-- 11 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">11. Seller & Business Terms</h2>
        </template>

        <p>
          Businesses using Markit ERP and selling through the platform agree to:
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>Provide accurate product listings and pricing</li>
          <li>Fulfill orders in a timely manner</li>
          <li>Honor Try-at-Home and booking commitments</li>
          <li>Comply with applicable tax and GST regulations</li>
        </ul>

        <p class="mt-3">
          Markit reserves the right to suspend seller accounts for policy violations.
        </p>
      </UCard>

      <!-- 12 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">12. Intellectual Property</h2>
        </template>

        <p>
          All content on the Markit platform including logos, design, text, and software
          is the property of Flobit Technologies Private Limited.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>You may not copy, reproduce, or distribute content without permission.</li>
          <li>Unauthorized use may result in legal action.</li>
        </ul>
      </UCard>

      <!-- 13 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">13. Limitation of Liability</h2>
        </template>

        <p>
          Markit acts solely as a facilitator between users and retailers.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>We are not responsible for product quality or defects.</li>
          <li>We are not liable for delays or service interruptions.</li>
          <li>We are not responsible for disputes between users and sellers.</li>
        </ul>

        <p class="mt-3 font-medium">
          Use of the platform is at your own risk.
        </p>
      </UCard>

      <!-- 14 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">14. Indemnification</h2>
        </template>

        <p>
          You agree to indemnify and hold harmless Markit and its team from any claims,
          damages, or liabilities arising from your use of the platform or violation of these Terms.
        </p>
      </UCard>

            <!-- 15 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">15. Suspension & Termination</h2>
        </template>

        <p>
          We reserve the right to suspend or terminate your access to Markit at any time,
          with or without notice, under the following conditions:
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>Violation of these Terms</li>
          <li>Fraudulent or suspicious activity</li>
          <li>Misuse of Try-at-Home or delivery services</li>
          <li>Non-compliance with applicable laws</li>
        </ul>

        <p class="mt-3">
          Upon termination, your access to services will be revoked immediately.
        </p>
      </UCard>

      <!-- 16 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">16. Governing Law & Jurisdiction</h2>
        </template>

        <p>
          These Terms shall be governed by and interpreted in accordance with the laws of India.
        </p>

        <p class="mt-3">
          Any disputes arising from these Terms shall be subject to the exclusive jurisdiction
          of courts located in Karnataka, India.
        </p>
      </UCard>

      <!-- 17 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">17. Dispute Resolution</h2>
        </template>

        <p>
          In the event of any dispute, you agree to first contact us to seek resolution.
        </p>

        <p class="mt-3">
          If unresolved, disputes may be referred to arbitration in accordance with
          the Arbitration and Conciliation Act, 1996.
        </p>
      </UCard>

      <!-- 18 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">18. Changes to Terms</h2>
        </template>

        <p>
          We may update or modify these Terms at any time without prior notice.
        </p>

        <p class="mt-3">
          Continued use of the platform after changes constitutes acceptance of the revised Terms.
        </p>
      </UCard>

      <!-- 19 -->
      <UCard class="mb-6 bg-gray-50 border-l-4 border-[#097D4C]">
        <template #header>
          <h2 class="font-semibold text-lg text-[#097D4C]">
            19. Privacy Policy
          </h2>
        </template>

        <p>
          Your use of Markit is also governed by this Privacy Policy section.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>We collect only necessary personal information</li>
          <li>We do not sell your personal data</li>
          <li>Payments are securely processed via third-party providers</li>
          <li>You retain rights under applicable data protection laws</li>
        </ul>
      </UCard>

      <!-- 20 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">20. Data Collection</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>Name, phone number, email address</li>
          <li>Shipping and billing addresses</li>
          <li>Order history and transaction data</li>
          <li>Device information and usage logs</li>
          <li>Location data (only with permission)</li>
        </ul>
      </UCard>

      <!-- 21 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">21. Use of Data</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>To provide and improve services</li>
          <li>To process transactions and deliveries</li>
          <li>To communicate updates and notifications</li>
          <li>To prevent fraud and ensure security</li>
        </ul>
      </UCard>

            <!-- 22 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">22. Sharing of Data</h2>
        </template>

        <p>
          We may share your information only when necessary to provide our services.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>Payment gateway providers</li>
          <li>Delivery and logistics partners</li>
          <li>Cloud infrastructure providers</li>
          <li>Analytics and performance tools</li>
        </ul>

        <p class="mt-3 font-medium text-[#097D4C]">
          We do not sell or rent your personal data.
        </p>
      </UCard>

      <!-- 23 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">23. Cookies & Tracking Technologies</h2>
        </template>

        <p>
          We use cookies and similar technologies to enhance user experience and
          analyze platform performance.
        </p>

        <ul class="list-disc ml-6 mt-3 space-y-2">
          <li>Maintain user sessions</li>
          <li>Remember preferences</li>
          <li>Analyze usage patterns</li>
        </ul>
      </UCard>

      <!-- 24 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">24. Data Retention</h2>
        </template>

        <p>
          We retain your data only for as long as necessary to fulfill the purposes
          outlined in these Terms, unless a longer retention period is required by law.
        </p>
      </UCard>

      <!-- 25 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">25. Data Security</h2>
        </template>

        <p>
          We implement industry-standard security measures including encryption,
          access controls, and secure infrastructure.
        </p>

        <p class="mt-3">
          Our practices align with the Information Technology Act, 2000 and
          the Digital Personal Data Protection Act, 2023.
        </p>
      </UCard>

      <!-- 26 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">26. Your Rights</h2>
        </template>

        <ul class="list-disc ml-6 space-y-2">
          <li>Right to access your personal data</li>
          <li>Right to correct inaccurate information</li>
          <li>Right to request deletion</li>
          <li>Right to withdraw consent</li>
          <li>Right to grievance redressal</li>
        </ul>
      </UCard>

      <!-- 27 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">27. Third-Party Services</h2>
        </template>

        <p>
          Our platform may contain links or integrations with third-party services.
        </p>

        <p class="mt-3">
          We are not responsible for the privacy practices or content of such services.
        </p>
      </UCard>

      <!-- 28 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">28. Children's Privacy</h2>
        </template>

        <p>
          Markit is not intended for use by individuals under the age of 18.
        </p>

        <p class="mt-3">
          We do not knowingly collect personal data from minors.
        </p>
      </UCard>

      <!-- 29 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold text-lg">29. Updates to Privacy Section</h2>
        </template>

        <p>
          We may update this Privacy Policy section from time to time.
        </p>

        <p class="mt-3">
          Continued use of the platform constitutes acceptance of these updates.
        </p>
      </UCard>

      <!-- 30 -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-lg">30. Contact & Grievance Officer</h2>
        </template>

        <p><strong>Name:</strong> Reez</p>
        <p><strong>Email:</strong> reez@markit.co.in</p>

        <p class="mt-3 text-gray-600">
          2nd Floor, K-tech Innovation Hub, Plama Center,<br>
          Bejai – Kapikad Rd,<br>
          Mangaluru, Karnataka – 575004
        </p>
      </UCard>

    </UContainer>
  </UPage>
</template>

      