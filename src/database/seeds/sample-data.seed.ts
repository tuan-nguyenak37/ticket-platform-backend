import { DataSource } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import { seedEventCategories } from './event-categories.seed';

const PASSWORD_HASH_123456 =
  '$2b$10$40mCD2YOEijaNbggHEiGoekqcNov/5ULYaiyjTT1P6QhIYbjjjqHW';

export const BASELINE_USERS = [
  {
    userId: 'user_ybIprE_HoWwyC6Vw',
    email: 'admin@passve.example.com',
    fullName: 'Pass Ve Administrator',
    role: 'ADMIN',
  },
  {
    userId: 'user_H9bjz9NmG5DfRjOW',
    email: 'moderator@passve.example.com',
    fullName: 'Pass Ve Moderator',
    role: 'MODERATOR',
  },
  {
    userId: 'user_4FGa4Tjw1hoCpN9f',
    email: 'xindunglang@gmail.com',
    fullName: 'tuan',
    role: 'MODERATOR',
  },
  {
    userId: 'user_seSZptLopfbvGgGV',
    email: '23050150@student.bdu.edu.vn',
    fullName: 'Tuấn Nguyễn Văn',
    role: 'USER',
  },
  {
    userId: 'user_07ZDi0InyzsMgL_g',
    email: 'buyer@example.com',
    fullName: 'Trần Minh Khang',
    role: 'USER',
  },
] as const;

export const BASELINE_ORGANIZER = {
  organizerId: 'org_5Ytja3iA87ei4n3D',
  name: 'TicketVerse Entertainment',
  slug: 'tuan-nguyen-van-96ccbb198451',
  description:
    'Đơn vị tổ chức sự kiện biểu diễn, văn hóa nghệ thuật và công nghệ hàng đầu Việt Nam.',
  logoUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
  coverUrl:
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600',
  contactEmail: '23050150@student.bdu.edu.vn',
  contactPhone: '0385928172',
  status: 'ACTIVE',
  ownerUserId: 'user_seSZptLopfbvGgGV',
  bankName: 'MBBank',
  accountHolder: 'NGUYEN VAN TUAN',
  accountNumber: '0385928172',
};

export async function seedSampleData(dataSource: DataSource): Promise<void> {
  // 1. Seed Categories
  await seedEventCategories(dataSource);

  await dataSource.transaction(async (manager) => {
    // 2. Seed Users
    for (const u of BASELINE_USERS) {
      await manager.query(
        `INSERT INTO users (
          user_id, email, full_name, password_hash, phone_number,
          avatar_url, role, status, email_verified_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, '0385928172',
          NULL, $5, 'ACTIVE', clock_timestamp(), clock_timestamp(), clock_timestamp()
        )
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          status = 'ACTIVE',
          updated_at = clock_timestamp();`,
        [u.userId, u.email, u.fullName, PASSWORD_HASH_123456, u.role],
      );
    }

    // 3. Seed Organizer
    await manager.query(
      `INSERT INTO organizers (
        organizer_id, name, slug, description, logo_url, cover_url,
        contact_email, contact_phone, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', clock_timestamp(), clock_timestamp()
      )
      ON CONFLICT (organizer_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        logo_url = EXCLUDED.logo_url,
        cover_url = EXCLUDED.cover_url,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        status = 'ACTIVE',
        updated_at = clock_timestamp();`,
      [
        BASELINE_ORGANIZER.organizerId,
        BASELINE_ORGANIZER.name,
        BASELINE_ORGANIZER.slug,
        BASELINE_ORGANIZER.description,
        BASELINE_ORGANIZER.logoUrl,
        BASELINE_ORGANIZER.coverUrl,
        BASELINE_ORGANIZER.contactEmail,
        BASELINE_ORGANIZER.contactPhone,
      ],
    );

    // 4. Organizer Member (OWNER)
    await manager.query(
      `INSERT INTO organizer_members (
        member_id, organizer_id, user_id, role, created_at
      ) VALUES (
        $1, $2, $3, 'OWNER', clock_timestamp()
      )
      ON CONFLICT (organizer_id, user_id) DO UPDATE SET
        role = 'OWNER';`,
      [
        'member_DPXKHBNe3n3_U6bJ',
        BASELINE_ORGANIZER.organizerId,
        BASELINE_ORGANIZER.ownerUserId,
      ],
    );

    // 5. Organizer Payout Account
    await manager.query(
      `INSERT INTO organizer_payout_accounts (
        organizer_id, bank_name, account_holder, account_number, updated_at
      ) VALUES (
        $1, $2, $3, $4, clock_timestamp()
      )
      ON CONFLICT (organizer_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        account_holder = EXCLUDED.account_holder,
        account_number = EXCLUDED.account_number,
        updated_at = clock_timestamp();`,
      [
        BASELINE_ORGANIZER.organizerId,
        BASELINE_ORGANIZER.bankName,
        BASELINE_ORGANIZER.accountHolder,
        BASELINE_ORGANIZER.accountNumber,
      ],
    );

    // 6. Check if realistic events are already seeded
    const existingMainEvent = await manager.query(
      `SELECT event_id FROM events WHERE slug = $1`,
      ['anh-trai-vuot-ngan-chong-gai-2026'],
    );

    if (existingMainEvent.length > 0) {
      console.log('Sample realistic events already exist, skipping event seed.');
      return;
    }

    console.log('Seeding 5 realistic events, showings, and tickets...');

    const now = new Date();
    const addDays = (d: number, hour: number) => {
      const res = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      res.setUTCHours(hour, 0, 0, 0);
      return res;
    };

    const eventsData = [
      {
        slug: 'anh-trai-vuot-ngan-chong-gai-2026',
        title: 'Live Concert "Anh Trai Vượt Ngàn Chông Gai 2026"',
        categoryId: 'event_cat_live_music',
        posterUrl:
          'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200',
        description:
          'Đại nhạc hội đỉnh cao quy tụ hơn 30 anh tài cùng những màn trình diễn âm nhạc và thị giác bùng nổ hàng đầu Việt Nam.',
        showing: {
          name: 'Đêm diễn chính thức tại TP.HCM',
          venueName: 'Sân vận động Quân khu 7',
          address: '202 Hoàng Văn Thụ, Phường 9, Phú Nhuận',
          city: 'Thành phố Hồ Chí Minh',
          startTime: addDays(24, 19),
          endTime: addDays(24, 23),
        },
        ticketTypes: [
          {
            name: 'Hạng vé SVIP Sân Khấu',
            price: 2500000n,
            total: 100,
            maxPerOrder: 4,
            desc: 'Khu vực sát sân khấu chính, quyền lợi quà lưu niệm độc quyền & check-in lối ưu tiên.',
          },
          {
            name: 'Hạng vé VIP Khán Đài A',
            price: 1500000n,
            total: 250,
            maxPerOrder: 4,
            desc: 'Chỗ ngồi khán đài A có mái che, tầm nhìn trực diện toàn bộ sân khấu hoành tráng.',
          },
          {
            name: 'Hạng vé GA Sân Cỏ Tiêu Chuẩn',
            price: 800000n,
            total: 500,
            maxPerOrder: 6,
            desc: 'Khu vực đứng sôi động giữa lòng chảo sân vận động, hòa chung năng lượng hàng vạn khán giả.',
          },
        ],
      },
      {
        slug: 'nhung-thanh-pho-mo-mang-year-end-tour',
        title: 'Đêm nhạc "Những Thành Phố Mơ Màng Year End Tour"',
        categoryId: 'event_cat_live_music',
        posterUrl:
          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200',
        description:
          'Hành trình âm nhạc indie lãng mạn kết nối những trái tim đồng điệu qua các giai điệu hoàng hôn dịu dàng của Vũ, Chillies, Trang và nhiều nghệ sĩ khác.',
        showing: {
          name: 'Showcase Mơ Màng TP.HCM',
          venueName: 'Trung tâm Hội chợ và Triển lãm Sài Gòn (SECC)',
          address: '799 Nguyễn Văn Linh, Phường Tân Phú, Quận 7',
          city: 'Thành phố Hồ Chí Minh',
          startTime: addDays(31, 18),
          endTime: addDays(31, 22),
        },
        ticketTypes: [
          {
            name: 'Vé VIP Mộng Mơ',
            price: 950000n,
            total: 200,
            maxPerOrder: 4,
            desc: 'Khu vực VIP Fanzone gần nghệ sĩ kèm túi tote và poster có chữ ký.',
          },
          {
            name: 'Vé GA Tiêu Chuẩn',
            price: 550000n,
            total: 600,
            maxPerOrder: 4,
            desc: 'Khu vực tự do thưởng thức âm nhạc và chụp ảnh check-in hoàng hôn.',
          },
        ],
      },
      {
        slug: 'hcmc-midnight-marathon-2026',
        title: 'Giải chạy "HCMC Midnight Marathon 2026"',
        categoryId: 'event_cat_sports',
        posterUrl:
          'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1200',
        description:
          'Giải chạy đêm quy mô quốc tế băng qua các cung đường di sản và cầu Ba Son rực rỡ ánh đèn của thành phố mang tên Bác.',
        showing: {
          name: 'Race Night 2026',
          venueName: 'Công viên Bến Bạch Đằng',
          address: 'Đường Tôn Đức Thắng, Phường Bến Nghé, Quận 1',
          city: 'Thành phố Hồ Chí Minh',
          startTime: addDays(38, 23),
          endTime: addDays(39, 6),
        },
        ticketTypes: [
          {
            name: 'BIB 10KM City Run',
            price: 450000n,
            total: 300,
            maxPerOrder: 5,
            desc: 'Bao gồm race kit, áo thi đấu chính thức và kỷ niệm chương khi hoàn thành.',
          },
          {
            name: 'BIB 21KM Half Marathon',
            price: 750000n,
            total: 350,
            maxPerOrder: 5,
            desc: 'Thử thách cự ly bán marathon qua các điểm biểu tượng Sài Gòn đêm.',
          },
          {
            name: 'BIB 42KM Full Marathon',
            price: 950000n,
            total: 200,
            maxPerOrder: 5,
            desc: 'Cung đường 42.195 km chuẩn liên đoàn điền kinh dành cho các chân chạy kiên cường.',
          },
        ],
      },
      {
        slug: 'kich-loi-vu-idecaf',
        title: 'Vở kịch "Lôi Vũ" - Sân khấu kịch IDECAF',
        categoryId: 'event_cat_performing_arts',
        posterUrl:
          'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=1200',
        description:
          'Kiệt tác kịch tâm lý kinh điển với dàn diễn viên nghệ sĩ ưu tú kỳ cựu của Sân khấu IDECAF, mang lại những khoảnh khắc bi tráng và xúc cảm lắng đọng.',
        showing: {
          name: 'Suất diễn đặc biệt cuối tuần',
          venueName: 'Nhà hát Bến Thành',
          address: 'Số 6 Mạc Đĩnh Chi, Phường Bến Nghé, Quận 1',
          city: 'Thành phố Hồ Chí Minh',
          startTime: addDays(45, 19),
          endTime: addDays(45, 22),
        },
        ticketTypes: [
          {
            name: 'Hạng VIP - Tầng Trệt',
            price: 400000n,
            total: 150,
            maxPerOrder: 4,
            desc: 'Hàng ghế A-F tầng trệt, góc nhìn cận cảnh biểu cảm diễn viên.',
          },
          {
            name: 'Hạng A - Tầng Lầu',
            price: 250000n,
            total: 200,
            maxPerOrder: 4,
            desc: 'Khán đài tầng lầu bao quát toàn cảnh sân khấu và hiệu ứng âm thanh ánh sáng.',
          },
        ],
      },
      {
        slug: 'vietnam-ai-next-gen-cloud-summit-2026',
        title: 'Vietnam AI & Next-Gen Cloud Summit 2026',
        categoryId: 'event_cat_workshops',
        posterUrl:
          'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200',
        description:
          'Diễn đàn công nghệ chuyên sâu lớn nhất năm quy tụ 50+ diễn giả quốc tế chia sẻ về Generative AI, Large Language Models, Cloud-Native & Microservices Architecture.',
        showing: {
          name: 'Hội nghị toàn thể & Triển lãm Giải pháp',
          venueName: 'GEM Center',
          address: 'Số 8 Nguyễn Bỉnh Khiêm, Phường Đa Kao, Quận 1',
          city: 'Thành phố Hồ Chí Minh',
          startTime: addDays(52, 8),
          endTime: addDays(52, 17),
        },
        ticketTypes: [
          {
            name: 'Standard Delegate (Vé Tiêu Chuẩn)',
            price: 350000n,
            total: 300,
            maxPerOrder: 5,
            desc: 'Tham dự toàn bộ các phiên thảo luận chuyên đề và nhận tài liệu số hội thảo.',
          },
          {
            name: 'VIP Networking Pass',
            price: 1200000n,
            total: 100,
            maxPerOrder: 3,
            desc: 'Bao gồm tiệc trưa VIP Networking cùng diễn giả, Founder và CTO các tập đoàn công nghệ lớn.',
          },
        ],
      },
    ];

    const typeRegistry: Record<
      string,
      { ticketTypeId: string; price: bigint; name: string }
    > = {};

    for (const edata of eventsData) {
      const eventId = generateId('event');
      await manager.query(
        `INSERT INTO events (
          event_id, organizer_id, category_id, title, slug, description,
          poster_url, status, rejection_reason, reviewed_by, reviewed_at,
          created_at, updated_at, registration_questions
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'PUBLISHED', NULL, $8, clock_timestamp(),
          clock_timestamp(), clock_timestamp(), '[]'::jsonb
        );`,
        [
          eventId,
          BASELINE_ORGANIZER.organizerId,
          edata.categoryId,
          edata.title,
          edata.slug,
          edata.description,
          edata.posterUrl,
          'user_ybIprE_HoWwyC6Vw',
        ],
      );

      const showingId = generateId('show');
      await manager.query(
        `INSERT INTO showings (
          showing_id, event_id, name, start_time, end_time,
          venue_name, address, city, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), clock_timestamp()
        );`,
        [
          showingId,
          eventId,
          edata.showing.name,
          edata.showing.startTime,
          edata.showing.endTime,
          edata.showing.venueName,
          edata.showing.address,
          edata.showing.city,
        ],
      );

      const saleStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const saleEnd = new Date(
        edata.showing.startTime.getTime() - 2 * 60 * 60 * 1000,
      );

      for (const tt of edata.ticketTypes) {
        const ticketTypeId = generateId('tt');
        await manager.query(
          `INSERT INTO ticket_types (
            ticket_type_id, showing_id, name, description, price,
            sale_start_at, sale_end_at, max_per_order, resale_allowed,
            status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, true, 'ACTIVE',
            clock_timestamp(), clock_timestamp()
          );`,
          [
            ticketTypeId,
            showingId,
            tt.name,
            tt.desc,
            tt.price.toString(),
            saleStart,
            saleEnd,
            tt.maxPerOrder,
          ],
        );

        await manager.query(
          `INSERT INTO ticket_inventories (
            ticket_type_id, total_quantity, reserved_quantity, sold_quantity
          ) VALUES ($1, $2, 0, 0);`,
          [ticketTypeId, tt.total],
        );

        typeRegistry[`${edata.slug}:${tt.name}`] = {
          ticketTypeId,
          price: tt.price,
          name: tt.name,
        };
      }
    }

    // Helper to issue paid order & ticket
    const issueTicket = async (
      userId: string,
      ttInfo: { ticketTypeId: string; price: bigint; name: string },
    ) => {
      const orderId = generateId('order');
      const itemId = generateId('item');
      const ticketId = generateId('ticket');
      const credId = generateId('cred');
      const ownId = generateId('own');
      const payId = generateId('pay');
      const resId = generateId('res');

      await manager.query(
        `INSERT INTO orders (
          order_id, user_id, idempotency_key, status, total_amount,
          cancel_reason, created_at, updated_at, discount_id, discount_code,
          discount_amount, registration_answers
        ) VALUES (
          $1, $2, $3, 'PAID', $4, NULL, clock_timestamp(), clock_timestamp(),
          NULL, NULL, 0, '[]'::jsonb
        );`,
        [orderId, userId, generateId('idem'), ttInfo.price.toString()],
      );

      await manager.query(
        `INSERT INTO order_items (
          order_item_id, order_id, ticket_type_id, ticket_type_name,
          quantity, unit_price
        ) VALUES ($1, $2, $3, $4, 1, $5);`,
        [itemId, orderId, ttInfo.ticketTypeId, ttInfo.name, ttInfo.price.toString()],
      );

      await manager.query(
        `INSERT INTO payments (
          payment_id, order_id, status, amount, processed_at
        ) VALUES ($1, $2, 'SUCCEEDED', $3, clock_timestamp());`,
        [payId, orderId, ttInfo.price.toString()],
      );

      await manager.query(
        `INSERT INTO ticket_reservations (
          reservation_id, order_id, ticket_type_id, quantity, status,
          expires_at, settled_at
        ) VALUES ($1, $2, $3, 1, 'CONSUMED', clock_timestamp() + interval '15 minutes', clock_timestamp());`,
        [resId, orderId, ttInfo.ticketTypeId],
      );

      await manager.query(
        `INSERT INTO tickets (
          ticket_id, order_item_id, ticket_type_id, owner_user_id,
          ticket_number, status, issued_at, created_at, updated_at,
          checked_in_at, checked_in_by
        ) VALUES (
          $1, $2, $3, $4, 1, 'ACTIVE', clock_timestamp(),
          clock_timestamp(), clock_timestamp(), NULL, NULL
        );`,
        [ticketId, itemId, ttInfo.ticketTypeId, userId],
      );

      await manager.query(
        `INSERT INTO ticket_credentials (
          credential_id, ticket_id, revoked_at, created_at
        ) VALUES ($1, $2, NULL, clock_timestamp());`,
        [credId, ticketId],
      );

      await manager.query(
        `INSERT INTO ticket_ownerships (
          ownership_id, ticket_id, from_user_id, to_user_id, created_at
        ) VALUES ($1, $2, NULL, $3, clock_timestamp());`,
        [ownId, ticketId, userId],
      );

      await manager.query(
        `UPDATE ticket_inventories
        SET sold_quantity = sold_quantity + 1
        WHERE ticket_type_id = $1;`,
        [ttInfo.ticketTypeId],
      );

      return ticketId;
    };

    // Helper for resale listings
    const createResale = async (
      ticketId: string,
      sellerId: string,
      price: bigint,
      bank: { name: string; holder: string; account: string },
    ) => {
      const feeBps = 500;
      const feeAmount = (price * BigInt(feeBps)) / 10000n;
      const netAmount = price - feeAmount;
      const listingId = generateId('list');

      await manager.query(
        `INSERT INTO resale_listings (
          listing_id, ticket_id, seller_user_id, price, status,
          created_at, updated_at, bank_name, account_holder, account_number,
          fee_basis_points, fee_amount, net_amount
        ) VALUES (
          $1, $2, $3, $4, 'AVAILABLE', clock_timestamp(), clock_timestamp(),
          $5, $6, $7, $8, $9, $10
        );`,
        [
          listingId,
          ticketId,
          sellerId,
          price.toString(),
          bank.name,
          bank.holder,
          bank.account,
          feeBps,
          feeAmount.toString(),
          netAmount.toString(),
        ],
      );
    };

    const tuanId = 'user_seSZptLopfbvGgGV';
    const buyerId = 'user_07ZDi0InyzsMgL_g';

    // 7. Issue tickets for Tuấn Nguyễn (4 tickets)
    await issueTicket(
      tuanId,
      typeRegistry['anh-trai-vuot-ngan-chong-gai-2026:Hạng vé VIP Khán Đài A'],
    );
    await issueTicket(
      tuanId,
      typeRegistry['nhung-thanh-pho-mo-mang-year-end-tour:Vé VIP Mộng Mơ'],
    );
    const t3 = await issueTicket(
      tuanId,
      typeRegistry['hcmc-midnight-marathon-2026:BIB 21KM Half Marathon'],
    );
    await createResale(t3, tuanId, 700000n, {
      name: 'MBBank',
      holder: 'NGUYEN VAN TUAN',
      account: '0385928172',
    });
    await issueTicket(
      tuanId,
      typeRegistry['kich-loi-vu-idecaf:Hạng VIP - Tầng Trệt'],
    );

    // 8. Issue tickets & resale for Buyer (Trần Minh Khang)
    const tb1 = await issueTicket(
      buyerId,
      typeRegistry['anh-trai-vuot-ngan-chong-gai-2026:Hạng vé GA Sân Cỏ Tiêu Chuẩn'],
    );
    await createResale(tb1, buyerId, 750000n, {
      name: 'Vietcombank',
      holder: 'TRAN MINH KHANG',
      account: '0123456789',
    });

    const tb2 = await issueTicket(
      buyerId,
      typeRegistry['vietnam-ai-next-gen-cloud-summit-2026:VIP Networking Pass'],
    );
    await createResale(tb2, buyerId, 1000000n, {
      name: 'Techcombank',
      holder: 'TRAN MINH KHANG',
      account: '19036782910012',
    });

    console.log('Sample realistic data seeded successfully!');
  });
}
