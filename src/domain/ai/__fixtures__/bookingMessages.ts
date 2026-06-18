export interface BookingFixture {
  id: string
  text: string
  description: string
  expectedComplexity: string
  expectedBypass: boolean
  expected: {
    customerName?: string
    phone?: string
    guestCount?: number
    bookingDate?: string
    bookingTime?: string
    hasMenu?: boolean
  }
}

export const BOOKING_FIXTURES: BookingFixture[] = [
  {
    id: 'simple_01',
    text: 'Đặt bàn 5 người tối mai 7h, liên hệ chị Vy 0901234567',
    description: 'Tin nhắn đơn giản đủ thông tin, không món ăn, ngày giờ rõ ràng',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Vy',
      phone: '0901234567',
      guestCount: 5,
      hasMenu: false
    }
  },
  {
    id: 'simple_02',
    text: 'Ban oi dat ban giup minh vao 19:30 ngay 20/06/2026. Ban 4 nguoi ten Huy sdt 0987654321 nhe',
    description: 'Tin nhắn đặt bàn đơn giản có số điện thoại, ngày giờ cụ thể',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Huy',
      phone: '0987654321',
      guestCount: 4,
      bookingDate: '20/06/2026',
      bookingTime: '19:30',
      hasMenu: false
    }
  },
  {
    id: 'missing_date',
    text: 'Đặt bàn 10 người lúc 18:00, liên hệ anh Nam 0912345678',
    description: 'Thiếu ngày đặt bàn',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      customerName: 'Nam',
      phone: '0912345678',
      guestCount: 10,
      bookingTime: '18:00',
      hasMenu: false
    }
  },
  {
    id: 'missing_time',
    text: 'Đặt bàn ngày mai cho 6 người, liên hệ chị Mai 0933334455',
    description: 'Thiếu giờ đặt bàn',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      customerName: 'Mai',
      phone: '0933334455',
      guestCount: 6,
      hasMenu: false
    }
  },
  {
    id: 'missing_phone',
    text: 'Đặt bàn 4 người tối nay 19:00, tên Minh',
    description: 'Thiếu số điện thoại',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      customerName: 'Minh',
      guestCount: 4,
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'menu_01',
    text: 'Đặt bàn 5 người 19:00 tối mai. Cho e set Sum Vầy [1] nha chị Vy 0901234567',
    description: 'Tin nhắn có món ăn/set menu',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Vy',
      phone: '0901234567',
      guestCount: 5,
      bookingTime: '19:00',
      hasMenu: true
    }
  },
  {
    id: 'menu_02',
    text: 'Cho e order 2 ba chỉ bò Mỹ, 1 nạc vai heo và 1 lẩu thái cua đồng tối nay 6h nha. Sdt e 0909090909 tên Tú. Đi 6 người',
    description: 'Tin nhắn gọi nhiều món lẻ',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Tú',
      phone: '0909090909',
      guestCount: 6,
      bookingTime: '18:00',
      hasMenu: true
    }
  },
  {
    id: 'ambiguous_time',
    text: 'Đặt bàn lúc rảnh tối mai cho 8 người nha chị, sđt 0981122334 tên Hạnh',
    description: 'Thời gian mơ hồ',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      customerName: 'Hạnh',
      phone: '0981122334',
      guestCount: 8,
      hasMenu: false
    }
  },
  {
    id: 'ambiguous_ref',
    text: 'Cho em đặt lại bàn như hôm trước nha chị, 6 người sđt 0903333333 tên Hùng',
    description: 'Có cụm từ tham chiếu mơ hồ ("như hôm trước")',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      customerName: 'Hùng',
      phone: '0903333333',
      guestCount: 6,
      hasMenu: false
    }
  },
  {
    id: 'spelling_error',
    text: 'Dặt bàng 4 nguoi luc 19h toi nay, sdt 0905555555 ten Linh',
    description: 'Sai chính tả nhẹ ("Dặt bàng")',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Linh',
      phone: '0905555555',
      guestCount: 4,
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'noise_numbers',
    text: 'Đặt bàn cho 5 người tối nay lúc 20h. Sđt liên hệ 0977665544. CMTND số 0123456789',
    description: 'Tin nhắn có số gây nhiễu (số CMTND)',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      phone: '0977665544',
      guestCount: 5,
      bookingTime: '20:00',
      hasMenu: false
    }
  },
  {
    id: 'simple_03',
    text: 'Anh Thanh 0982223344 dat ban 8 nguoi 18:30 ngay 21/06/2026',
    description: 'Tin nhắn ngắn đủ thông tin',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Thanh',
      phone: '0982223344',
      guestCount: 8,
      bookingDate: '21/06/2026',
      bookingTime: '18:30',
      hasMenu: false
    }
  },
  {
    id: 'simple_04',
    text: 'Chi Linh dat ban 12 nguoi luc 11:30 trua mai. Sdt chi 0914112233',
    description: 'Đặt bàn buổi trưa',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Linh',
      phone: '0914112233',
      guestCount: 12,
      bookingTime: '11:30',
      hasMenu: false
    }
  },
  {
    id: 'missing_name',
    text: 'Dat ban 4 nguoi 19h30 toi nay sdt 0987111222',
    description: 'Thiếu tên khách đặt',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      phone: '0987111222',
      guestCount: 4,
      bookingTime: '19:30',
      hasMenu: false
    }
  },
  {
    id: 'menu_03',
    text: 'Nhom minh di 10 nguoi, book ban luc 19:00 ngay mai nhe. Set menu cua minh la Set Sum Vay va 10 chai bia Hanoi. Ten e la Cuong 0905123456',
    description: 'Có set ăn và thức uống',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Cuong',
      phone: '0905123456',
      guestCount: 10,
      bookingTime: '19:00',
      hasMenu: true
    }
  },
  {
    id: 'menu_04',
    text: 'Dat ban 5 nguoi luc 18:00. Mon an lay truoc 1 dia khoai tay chien, 1 thit nuong xien vao sdt 0918889999 ten An',
    description: 'Gọi món khai vị',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'An',
      phone: '0918889999',
      guestCount: 5,
      bookingTime: '18:00',
      hasMenu: true
    }
  },
  {
    id: 'ambiguous_party',
    text: 'Dat ban an tiec sinh nhat 20 nguoi luc 19h ngay 25/06/2026. Lien he anh Son 0938887766. Can set up san bong bay.',
    description: 'Tiệc sinh nhật cần set up',
    expectedComplexity: 'simple_booking', // Tiệc sinh nhật không có món ăn vẫn phân loại simple/missing tùy thuộc vào cấu hình, nhưng có yêu cầu set up
    expectedBypass: true, // Nếu trích xuất đủ thông tin thì có thể bypass
    expected: {
      customerName: 'Son',
      phone: '0938887766',
      guestCount: 20,
      bookingDate: '25/06/2026',
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'menu_05',
    text: 'Minh muon dat ban an lau chieu nay luc 17:30. Cho minh 1 set lau Thai 350k. Minh di 4 nguoi sdt 0902123456 ten Minh.',
    description: 'Gọi lẩu thái cụ thể giá',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Minh',
      phone: '0902123456',
      guestCount: 4,
      bookingTime: '17:30',
      hasMenu: true
    }
  },
  {
    id: 'conflict_01',
    text: 'Dat ban 5 nguoi, a khong di 7 nguoi nha e luc 19h. Sdt 0907123456 ten Khanh',
    description: 'Có sửa đổi thông tin trong tin nhắn (5 người đổi thành 7 người)',
    expectedComplexity: 'simple_booking',
    expectedBypass: true, // Nếu regex hoặc rule trích xuất được 7 người thì vẫn bypass
    expected: {
      customerName: 'Khanh',
      phone: '0907123456',
      guestCount: 7,
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'simple_05',
    text: 'Anh Phuc dat ban 2 nguoi luc 20h toi nay. Sdt 0909112233',
    description: 'Đặt bàn cặp đôi',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Phuc',
      phone: '0909112233',
      guestCount: 2,
      bookingTime: '20:00',
      hasMenu: false
    }
  },
  {
    id: 'simple_06',
    text: 'Ban oi book minh ban 15 nguoi luc 18:30 toi mai. Sdt 0937111222 ten Thao nhe',
    description: 'Đặt bàn đông người nhóm',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Thao',
      phone: '0937111222',
      guestCount: 15,
      bookingTime: '18:30',
      hasMenu: false
    }
  },
  {
    id: 'menu_06',
    text: 'Cho e order combo nuong 499k cho 4 nguoi an luc 19h toi nay nha shop. Sdt e 0903888888 ten Lan',
    description: 'Đặt combo nướng',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Lan',
      phone: '0903888888',
      guestCount: 4,
      bookingTime: '19:00',
      hasMenu: true
    }
  },
  {
    id: 'menu_07',
    text: 'Dat ban 3 nguoi luc 20h. Lay truoc 3 chai bia va 1 dia dau hu chien. Sdt 0902223333 ten Hoang',
    description: 'Gọi bia và đậu hũ',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Hoang',
      phone: '0902223333',
      guestCount: 3,
      bookingTime: '20:00',
      hasMenu: true
    }
  },
  {
    id: 'missing_all',
    text: 'Minh muon dat ban an toi nay',
    description: 'Thiếu hầu hết thông tin cốt lõi',
    expectedComplexity: 'booking_with_missing_fields',
    expectedBypass: false,
    expected: {
      hasMenu: false
    }
  },
  {
    id: 'simple_07',
    text: 'Dat ban 6 nguoi 19h ngay 22/06/2026 sdt 0909555666 ten Giang',
    description: 'Đặt bàn đầy đủ thông tin chuẩn hóa',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Giang',
      phone: '0909555666',
      guestCount: 6,
      bookingDate: '22/06/2026',
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'simple_08',
    text: 'Dat ban 5 nguoi, lien he Hung 0902999888. Luc 18h30 toi mai nhe shop',
    description: 'Đặt bàn tối mai lúc 18h30',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Hung',
      phone: '0902999888',
      guestCount: 5,
      bookingTime: '18:30',
      hasMenu: false
    }
  },
  {
    id: 'menu_08',
    text: 'Goi truoc cho anh 1 set thit nuong thap cam. Anh di 6 nguoi toi nay luc 19:30. Sdt anh Binh 0908777666',
    description: 'Gọi thịt nướng thập cẩm',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Binh',
      phone: '0908777666',
      guestCount: 6,
      bookingTime: '19:30',
      hasMenu: true
    }
  },
  {
    id: 'menu_09',
    text: 'Dat ban 4 nguoi luc 19h30 toi nay. Cho anh 4 suat buffet nuong 299k nhe. Ten anh Phat sdt 0917111222',
    description: 'Gọi suất buffet',
    expectedComplexity: 'booking_with_menu',
    expectedBypass: false,
    expected: {
      customerName: 'Phat',
      phone: '0917111222',
      guestCount: 4,
      bookingTime: '19:30',
      hasMenu: true
    }
  },
  {
    id: 'simple_09',
    text: 'Chi Trinh dat ban 8 nguoi luc 19h ngay 23/06/2026. Sdt chi 0938112233',
    description: 'Đặt bàn ngày xa cụ thể',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Trinh',
      phone: '0938112233',
      guestCount: 8,
      bookingDate: '23/06/2026',
      bookingTime: '19:00',
      hasMenu: false
    }
  },
  {
    id: 'simple_10',
    text: 'Dat ban 5 nguoi toi nay 20h sdt 0988777666 ten Kien',
    description: 'Đặt bàn tối nay lúc 20h',
    expectedComplexity: 'simple_booking',
    expectedBypass: true,
    expected: {
      customerName: 'Kien',
      phone: '0988777666',
      guestCount: 5,
      bookingTime: '20:00',
      hasMenu: false
    }
  }
]
