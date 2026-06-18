/**
 * JSON Schema for Booking Extraction
 * Matches the existing structure to ensure 100% backward compatibility
 */
export const BOOKING_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    customer: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên khách hàng hoặc tên liên hệ đặt bàn' },
        phone: { type: 'string', description: 'Số điện thoại liên hệ' },
        confidence: { type: 'number', description: 'Độ tin cậy của trường customer (0.0 - 1.0)' }
      },
      required: ['name', 'phone', 'confidence']
    },
    party: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Loại tiệc (Sinh nhật, Thôi nôi (1st), Công ty, Ăn thường, v.v.)' },
        owner_name: { type: 'string', description: 'Tên chủ nhân tiệc' },
        display_board_text: { type: 'string', description: 'Nội dung chữ trên bảng trang trí' },
        special_request: { type: 'string', description: 'Yêu cầu đặc biệt về tiệc' },
        confidence: { type: 'number', description: 'Độ tin cậy của trường party (0.0 - 1.0)' }
      },
      required: ['type', 'owner_name', 'display_board_text', 'special_request', 'confidence']
    },
    booking: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Ngày đặt bàn định dạng DD/MM/YYYY' },
        time: { type: 'string', description: 'Giờ đặt bàn định dạng HH:mm' },
        guest_count: { type: ['integer', 'null'], description: 'Số lượng khách (người lớn + trẻ em)' },
        table_count: { type: ['integer', 'null'], description: 'Số lượng bàn ăn' },
        tables: { type: 'string', description: 'Mã số bàn được xếp' },
        confidence: { type: 'number', description: 'Độ tin cậy của trường booking (0.0 - 1.0)' }
      },
      required: ['date', 'time', 'guest_count', 'table_count', 'tables', 'confidence']
    },
    menu_items: {
      type: 'array',
      description: 'Danh sách các món ăn trích xuất được',
      items: {
        type: 'object',
        properties: {
          raw_name: { type: 'string', description: 'Tên món ăn thô viết trong tin nhắn' },
          matched_name: { type: 'string', description: 'Tên món chính thức khớp với thực đơn hoặc chuỗi rỗng' },
          quantity: { type: ['integer', 'null'], description: 'Số lượng món ăn' },
          note: { type: 'string', description: 'Ghi chú cho món ăn này' },
          confidence: { type: 'number', description: 'Độ tin cậy khớp món (0.0 - 1.0)' },
          needs_review: { type: 'boolean', description: 'Đánh dấu cần xem lại nếu không chắc chắn' }
        },
        required: ['raw_name', 'matched_name', 'quantity', 'note', 'confidence', 'needs_review']
      }
    },
    note: { type: 'string', description: 'Ghi chú chung cho đơn đặt bàn' },
    needs_review: {
      type: 'array',
      items: { type: 'string' },
      description: 'Danh sách các mã cảnh báo cần xem lại'
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Danh sách cảnh báo bổ sung'
    },
    raw_entities: {
      type: 'object',
      properties: {
        people_names: { type: 'array', items: { type: 'string' } },
        phones: { type: 'array', items: { type: 'string' } },
        dates: { type: 'array', items: { type: 'string' } },
        times: { type: 'array', items: { type: 'string' } },
        numbers: { type: 'array', items: { type: 'number' } }
      },
      required: ['people_names', 'phones', 'dates', 'times', 'numbers']
    }
  },
  required: ['customer', 'party', 'booking', 'menu_items', 'note', 'needs_review', 'warnings', 'raw_entities']
}
