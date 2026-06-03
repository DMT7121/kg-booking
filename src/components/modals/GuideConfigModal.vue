<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()
const activeTab = ref('general') // 'general' | 'ai' | 'offline' | 'faq'
</script>

<template>
  <div v-if="ui.activeSettingModal === 'guide'" class="flex flex-col h-full bg-slate-50 md:bg-white overflow-hidden w-full relative z-[1000] lg:z-10 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Hướng dẫn sử dụng</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Cẩm nang vận hành hệ thống</p>
      </div>
      <div class="w-10 h-10"></div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-slate-100 bg-white shrink-0 overflow-x-auto scrollbar-none flex-nowrap">
      <button 
        @click="activeTab = 'general'" 
        :class="['flex-1 min-w-[90px] py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all whitespace-nowrap', activeTab === 'general' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-circle-info mr-1"></i> Quy trình
      </button>
      <button 
        @click="activeTab = 'ai'" 
        :class="['flex-1 min-w-[90px] py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all whitespace-nowrap', activeTab === 'ai' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Trợ lý AI
      </button>
      <button 
        @click="activeTab = 'offline'" 
        :class="['flex-1 min-w-[90px] py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all whitespace-nowrap', activeTab === 'offline' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-wifi mr-1"></i> Ngoại tuyến
      </button>
      <button 
        @click="activeTab = 'faq'" 
        :class="['flex-1 min-w-[90px] py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all whitespace-nowrap', activeTab === 'faq' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-circle-question mr-1"></i> Giải đáp
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white p-4">
      <div class="max-w-2xl mx-auto w-full space-y-6 pb-20">

        <!-- TAB 1: General Flow -->
        <div v-if="activeTab === 'general'" class="space-y-5">
          <div class="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
            <div class="absolute right-0 bottom-0 opacity-10 translate-y-4 translate-x-4"><i class="fa-solid fa-book text-9xl"></i></div>
            <h3 class="text-lg font-black uppercase tracking-wide mb-1.5 flex items-center gap-2"><i class="fa-solid fa-book-open-reader"></i> Quy trình tạo phiếu chuẩn</h3>
            <p class="text-xs text-blue-100 font-medium leading-relaxed font-semibold">Quy trình vận hành khép kín giúp tạo phiếu đặt, quản lý thông tin đặt cọc, in ấn hóa đơn và đồng bộ lịch sơ đồ một cách chuyên nghiệp nhất.</p>
          </div>

          <div class="space-y-3">
            <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Hướng dẫn chi tiết từng bước</h4>
            <div class="bg-white rounded-3xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              
              <!-- Step 1 -->
              <div class="p-4 flex gap-4">
                <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black shrink-0 shadow-sm border border-blue-100">1</div>
                <div class="space-y-1">
                  <h5 class="font-black text-slate-800 text-[13px]">Nhập nội dung thô (Văn bản hoặc Hình ảnh)</h5>
                  <p class="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Tại khung nhập liệu AI ở đầu trang, bạn dán nội dung tin nhắn chat của khách (bao gồm cả các yêu cầu về món ăn, ngày giờ, số khách) hoặc tải lên ảnh chụp tin nhắn, ảnh chuyển khoản ngân hàng.
                  </p>
                </div>
              </div>

              <!-- Step 2 -->
              <div class="p-4 flex gap-4">
                <div class="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-black shrink-0 shadow-sm border border-indigo-100">2</div>
                <div class="space-y-1">
                  <h5 class="font-black text-slate-800 text-[13px]">Xử lý Phân Tích bằng AI</h5>
                  <p class="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Bấm nút <span class="text-blue-700 font-black">PHÂN TÍCH AI</span>. Hệ thống tự động bóc tách thông tin khách hàng, số điện thoại, ngày giờ tiệc, số lượng khách (Pax), bàn và danh sách món ăn từ nội dung đã nhập. Các trường dữ liệu sẽ tự động được điền vào form bên dưới.
                  </p>
                </div>
              </div>

              <!-- Step 3 -->
              <div class="p-4 flex gap-4">
                <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-black shrink-0 shadow-sm border border-emerald-100">3</div>
                <div class="space-y-1">
                  <h5 class="font-black text-slate-800 text-[13px]">Quản lý Đặt cọc & Lịch bàn</h5>
                  <p class="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Nhập số tiền đặt cọc và tick chọn <span class="text-emerald-700 font-black">Đã đặt cọc</span> nếu khách đã chuyển khoản thành công. Tải ảnh ủy nhiệm chi hoặc hóa đơn chuyển khoản lên mục cọc để làm minh chứng trực quan trên bill.
                  </p>
                </div>
              </div>

              <!-- Step 4 -->
              <div class="p-4 flex gap-4">
                <div class="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-black shrink-0 shadow-sm border border-purple-100">4</div>
                <div class="space-y-1">
                  <h5 class="font-black text-slate-800 text-[13px]">Lưu phiếu, In ấn và Chia sẻ</h5>
                  <p class="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Bấm <span class="text-emerald-700 font-black">TẠO ĐƠN</span> để đẩy dữ liệu lên Google Sheets. Sau đó sử dụng tab "Xem thử bill" để:
                    <br>• Copy mẫu tin nhắn xác nhận gửi khách hàng qua MXH.
                    <br>• Tải file ảnh hóa đơn sắc nét hoặc file PDF chuyên nghiệp.
                    <br>• In trực tiếp ra giấy để giao cho bộ phận Bếp/Bar chuẩn bị.
                  </p>
                </div>
              </div>

            </div>
          </div>

          <!-- Feature Tip -->
          <div class="bg-amber-50/90 border border-amber-200 rounded-3xl p-5 text-amber-900 space-y-2">
            <h5 class="font-black text-xs uppercase tracking-wide flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i> Lưu ý quan trọng khi cập nhật hoặc đổi phiếu</h5>
            <div class="text-[11px] font-bold leading-relaxed space-y-1.5 text-slate-700">
              <p>Hệ thống có cơ chế bảo vệ trạng thái chỉnh sửa:</p>
              <p>• Khi bạn nhấn vào một phiếu cũ trong danh sách Lịch Sử, hệ thống sẽ chuyển sang chế độ chỉnh sửa (Edit mode). Một dải cảnh báo màu xanh da trời sẽ xuất hiện ở trên cùng báo hiệu bạn đang chỉnh sửa phiếu cũ.</p>
              <p>• Để tránh vô tình ghi đè thông tin của phiếu đó khi muốn tạo một phiếu đặt hoàn toàn mới, hãy nhấn nút <span class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-black"><i class="fa-solid fa-file-circle-plus"></i> Tạo lịch mới</span> có ở cả Banner cảnh báo và dưới cùng bên trái của Thanh công cụ để xóa sạch dữ liệu form cũ và chuẩn bị cho đơn mới.</p>
            </div>
          </div>
        </div>

        <!-- TAB 2: AI Assistant -->
        <div v-if="activeTab === 'ai'" class="space-y-5">
          <div class="bg-gradient-to-r from-purple-600 to-pink-500 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
            <div class="absolute right-0 bottom-0 opacity-10 translate-y-4 translate-x-4"><i class="fa-solid fa-wand-magic-sparkles text-9xl"></i></div>
            <h3 class="text-lg font-black uppercase tracking-wide mb-1.5 flex items-center gap-2"><i class="fa-solid fa-robot"></i> Trợ lý AI Core V7</h3>
            <p class="text-xs text-purple-100 font-medium leading-relaxed font-semibold">Tự động nhận diện dữ liệu thông minh, tra cứu danh mục thực đơn và phát hiện sai sót.</p>
          </div>

          <div class="space-y-4">
            <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
              <h4 class="font-black text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-2"><i class="fa-regular fa-lightbulb text-purple-500"></i> Các tính năng chính của Trợ lý AI</h4>
              <ul class="space-y-3.5 text-xs text-slate-650 font-semibold leading-relaxed">
                <li class="flex items-start gap-2.5">
                  <i class="fa-solid fa-circle-check text-emerald-500 mt-0.5 shrink-0"></i>
                  <span><strong>Nhận dạng thực thể:</strong> AI tự tách số điện thoại, phân tích tên khách hàng, chuẩn hóa thời gian về định dạng <code class="bg-slate-100 px-1 py-0.5 rounded font-black text-purple-700">HH:MM</code> và ngày về dạng <code class="bg-slate-100 px-1 py-0.5 rounded font-black text-purple-700">DD/MM/YYYY</code>.</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fa-solid fa-circle-check text-emerald-500 mt-0.5 shrink-0"></i>
                  <span><strong>Khớp danh sách món (Menu Mapping):</strong> Đối chiếu từ khóa thức ăn trong văn bản của khách với danh sách món trong database thực đơn hiện tại của nhà hàng để tự động thêm đúng món, đúng giá.</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fa-solid fa-circle-check text-emerald-500 mt-0.5 shrink-0"></i>
                  <span><strong>Từ viết tắt (Menu Aliases):</strong> Người dùng có thể khai báo các từ viết tắt tại Cài đặt. Ví dụ: "bò nướng lò" → "Thịt Bò Mỹ Nướng Đá Lò", AI sẽ tự động ánh xạ chính xác.</span>
                </li>
                <li class="flex items-start gap-2.5">
                  <i class="fa-solid fa-circle-check text-emerald-500 mt-0.5 shrink-0"></i>
                  <span><strong>Gợi ý vị trí bàn trống:</strong> Hệ thống tự động đối chiếu khoảng thời gian đặt bàn với các đơn hàng hiện có cùng giờ để hiển thị danh sách khu vực bàn còn trống, tránh xung đột xếp bàn.</span>
                </li>
              </ul>
            </div>

            <!-- Workflow Mode -->
            <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
              <h4 class="font-black text-slate-800 text-sm border-b border-slate-100 pb-2"><i class="fa-solid fa-sliders text-purple-500 mr-1.5"></i> Chế độ xem duyệt kết quả AI</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div class="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div class="font-bold text-slate-800 text-[12px] flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Chế độ Direct (Điền thẳng)</div>
                    <p class="text-slate-550 mt-1 leading-relaxed text-[11px] font-semibold">Hệ thống ghi nhận kết quả và điền đè ngay lập tức các trường dữ liệu trên form. Nhanh gọn cho các yêu cầu tiệc đơn giản.</p>
                  </div>
                </div>
                <div class="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div class="font-bold text-slate-800 text-[12px] flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Chế độ Review (Kiểm duyệt)</div>
                    <p class="text-slate-550 mt-1 leading-relaxed text-[11px] font-semibold">Hiển thị bảng so sánh chi tiết giữa thông tin AI phân tích được và form hiện tại. Bạn có quyền tick chọn chỉ đồng ý cập nhật các trường mong muốn.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: Offline Sync -->
        <div v-if="activeTab === 'offline'" class="space-y-5">
          <div class="bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
            <div class="absolute right-0 bottom-0 opacity-10 translate-y-4 translate-x-4"><i class="fa-solid fa-wifi text-9xl"></i></div>
            <h3 class="text-lg font-black uppercase tracking-wide mb-1.5 flex items-center gap-2"><i class="fa-solid fa-network-wired"></i> Cơ chế Offline-First thông minh</h3>
            <p class="text-xs text-cyan-150 font-medium leading-relaxed font-semibold">Tự tin thao tác, ghi chép và in hóa đơn ngay cả khi mạng chập chờn hoặc ngắt kết nối hoàn toàn.</p>
          </div>

          <div class="space-y-4">
            <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
              <h4 class="font-black text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-2"><i class="fa-solid fa-cloud-arrow-up text-cyan-600"></i> Cách thức hoạt động của Hàng Đợi local</h4>
              <p class="text-xs text-slate-600 font-semibold leading-relaxed">
                Để đảm bảo tốc độ và trải nghiệm mượt mà, ứng dụng sử dụng cơ chế lưu trữ IndexedDB/LocalStorage trên thiết bị:
              </p>
              <ul class="space-y-3 text-xs text-slate-650 font-semibold list-decimal pl-4">
                <li><strong>Ghi nhận tức thì:</strong> Khi bạn bấm lưu/cập nhật đơn trong trạng thái mất kết nối mạng, hệ thống sẽ lưu thông tin đơn hàng tạm thời vào cơ sở dữ liệu trên trình duyệt.</li>
                <li><strong>Cảnh báo hàng đợi:</strong> Một chỉ số hàng đợi màu vàng kèm số đơn hàng đang chờ sẽ hiển thị ở góc trên màn hình biểu thị các đơn chưa được đẩy lên Google Sheets.</li>
                <li><strong>Tự động đồng bộ ngầm:</strong> Khi kết nối internet được khôi phục, hệ thống sẽ chạy tiến trình đồng bộ ngầm tự động để gửi tuần tự các đơn hàng lên Cloud và cập nhật lại sơ đồ lịch bàn.</li>
              </ul>
            </div>

            <!-- Connection Status Guide -->
            <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
              <h4 class="font-black text-slate-800 text-sm"><i class="fa-solid fa-circle-nodes text-cyan-600 mr-1.5"></i> Các biểu tượng trạng thái kết nối mạng</h4>
              <div class="grid grid-cols-1 gap-2 pt-1 text-xs">
                <div class="flex items-center gap-3 p-3 rounded-2xl border border-green-100 bg-green-50/20">
                  <span class="w-3.5 h-3.5 rounded-full bg-green-500 shrink-0"></span>
                  <div>
                    <div class="font-bold text-green-900">Trực tuyến (Online)</div>
                    <div class="text-[10px] text-green-600 mt-0.5">Trạng thái hoàn hảo. Mọi thay đổi dữ liệu sẽ được lưu lên Cloud trong thời gian thực.</div>
                  </div>
                </div>
                <div class="flex items-center gap-3 p-3 rounded-2xl border border-yellow-100 bg-yellow-50/20">
                  <span class="w-3.5 h-3.5 rounded-full bg-yellow-500 shrink-0 animate-pulse"></span>
                  <div>
                    <div class="font-bold text-yellow-900">Đang đồng bộ (Syncing)</div>
                    <div class="text-[10px] text-yellow-600 mt-0.5">Đang gửi dữ liệu hoặc hình ảnh lên server. Hãy giữ nguyên trang web tránh tắt trình duyệt.</div>
                  </div>
                </div>
                <div class="flex items-center gap-3 p-3 rounded-2xl border border-red-100 bg-red-50/20">
                  <span class="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0"></span>
                  <div>
                    <div class="font-bold text-red-900">Ngoại tuyến (Offline)</div>
                    <div class="text-[10px] text-red-650 mt-0.5">Đã ngắt mạng. Đơn hàng lưu sẽ được cất vào hàng đợi chờ đồng bộ.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 4: FAQ / Troubleshooting -->
        <div v-if="activeTab === 'faq'" class="space-y-5">
          <div class="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
            <div class="absolute right-0 bottom-0 opacity-10 translate-y-4 translate-x-4"><i class="fa-solid fa-circle-question text-9xl"></i></div>
            <h3 class="text-lg font-black uppercase tracking-wide mb-1.5 flex items-center gap-2"><i class="fa-solid fa-circle-question"></i> Giải đáp các câu hỏi thường gặp</h3>
            <p class="text-xs text-emerald-100 font-medium leading-relaxed font-semibold">Cách tự xử lý nhanh các tình huống phát sinh thường gặp trong quá trình vận hành.</p>
          </div>

          <div class="space-y-3.5">
            <div class="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-2">
              <h4 class="font-black text-slate-800 text-[13px] flex items-start gap-2"><span class="text-emerald-500 font-black">Q:</span><span>Làm sao biết được đơn đã lưu thành công lên Google Sheets chưa?</span></h4>
              <p class="text-xs text-slate-500 leading-relaxed font-semibold pl-6 border-l-2 border-slate-100">
                Hãy mở tab <span class="text-blue-900 font-black">Lịch Sử</span>. Các đơn hàng có biểu tượng tích xanh hoặc đám mây ổn định biểu thị đã lưu thành công lên Sheets. Nếu có biểu tượng đồng hồ hoặc cảnh báo màu vàng, nghĩa là đơn đang ở chế độ chờ mạng để đồng bộ.
              </p>
            </div>

            <div class="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-2">
              <h4 class="font-black text-slate-800 text-[13px] flex items-start gap-2"><span class="text-emerald-500 font-black">Q:</span><span>Tại sao khi tạo lịch cho khách mới, thông tin khách cũ vẫn bị dính trong form?</span></h4>
              <p class="text-xs text-slate-500 leading-relaxed font-semibold pl-6 border-l-2 border-slate-100">
                Do bạn vừa bấm vào xem chi tiết một phiếu cũ trong danh sách Lịch Sử. Để làm trống toàn bộ form và bắt đầu viết một phiếu mới an toàn mà không làm ảnh hưởng hay ghi đè lên dữ liệu cũ, hãy nhấn nút <strong class="text-blue-700">Tạo lịch mới</strong> ở góc dưới bên trái hoặc trên banner cảnh báo.
              </p>
            </div>

            <div class="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-2">
              <h4 class="font-black text-slate-800 text-[13px] flex items-start gap-2"><span class="text-emerald-500 font-black">Q:</span><span>Làm thế nào để thay đổi hoặc cập nhật thực đơn món ăn mới?</span></h4>
              <p class="text-xs text-slate-500 leading-relaxed font-semibold pl-6 border-l-2 border-slate-100">
                Bạn mở mục <strong>Cài đặt</strong> ở thanh menu chính, chọn tab <strong>Thực đơn</strong>. Tại đây bạn có thể chọn hoặc tải các danh sách menu được định cấu hình sẵn từ Google Sheets, chỉnh sửa giá bán hoặc thêm các hình ảnh thực đơn mới cho nhà hàng.
              </p>
            </div>

            <div class="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-2">
              <h4 class="font-black text-slate-800 text-[13px] flex items-start gap-2"><span class="text-emerald-500 font-black">Q:</span><span>Tôi dán tin nhắn vào nhưng AI điền thông tin món không chính xác?</span></h4>
              <p class="text-xs text-slate-500 leading-relaxed font-semibold pl-6 border-l-2 border-slate-100">
                Hãy kiểm tra xem món ăn trong tin nhắn của khách có được viết đúng chính tả hoặc từ viết tắt phổ biến không. Bạn có thể mở <strong>Cài đặt → AI → Thêm từ viết tắt</strong> để ánh xạ từ viết tắt của khách (ví dụ: "lẩu thái hải sản" viết tắt là "lths") với món ăn thực tế trong menu.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
