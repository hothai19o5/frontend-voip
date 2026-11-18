export const EMOJI_GROUPS = [
  {
    name: 'Cảm xúc',
    items: [
      ['😀', 'Vui vẻ'],
      ['😊', 'Mỉm cười'],
      ['😂', 'Cười ra nước mắt'],
      ['🤣', 'Cười lăn lộn'],
      ['🥰', 'Yêu thương'],
      ['😍', 'Mê quá'],
      ['😘', 'Gửi nụ hôn'],
      ['😎', 'Ngầu'],
      ['🤩', 'Hào hứng'],
      ['🥳', 'Tiệc tùng'],
      ['😅', 'Cười ngại'],
      ['😉', 'Nháy mắt'],
      ['🤔', 'Suy nghĩ'],
      ['🤗', 'Ôm nào'],
      ['🫡', 'Chào bạn'],
      ['🤭', 'Cười khúc khích'],
      ['🥹', 'Xúc động'],
      ['🥺', 'Năn nỉ'],
      ['😢', 'Buồn'],
      ['😭', 'Khóc'],
      ['😮', 'Ngạc nhiên'],
      ['😴', 'Buồn ngủ'],
      ['😇', 'Thiên thần'],
      ['😤', 'Giận dỗi'],
    ],
  },
  {
    name: 'Cử chỉ',
    items: [
      ['👋', 'Vẫy tay xin chào'],
      ['👍', 'Đồng ý tốt lắm'],
      ['👎', 'Không đồng ý'],
      ['👏', 'Vỗ tay'],
      ['🙌', 'Hoan hô'],
      ['🤝', 'Bắt tay'],
      ['🙏', 'Cảm ơn'],
      ['💪', 'Cố lên'],
      ['👌', 'Ổn rồi OK'],
      ['✌️', 'Chiến thắng'],
      ['🫶', 'Bàn tay trái tim'],
      ['🤞', 'May mắn'],
    ],
  },
  {
    name: 'Trái tim & niềm vui',
    items: [
      ['❤️', 'Trái tim đỏ'],
      ['🧡', 'Trái tim cam'],
      ['💛', 'Trái tim vàng'],
      ['💚', 'Trái tim xanh lá'],
      ['💙', 'Trái tim xanh dương'],
      ['💔', 'Tan vỡ'],
      ['💕', 'Hai trái tim'],
      ['💖', 'Lấp lánh yêu thương'],
      ['🎉', 'Chúc mừng'],
      ['🎂', 'Sinh nhật'],
      ['🎁', 'Quà tặng'],
      ['✨', 'Lấp lánh'],
      ['🔥', 'Lửa tuyệt vời'],
      ['🌟', 'Ngôi sao'],
      ['☕', 'Cà phê'],
      ['🌈', 'Cầu vồng'],
    ],
  },
] as const

export const EMOTES = [
  ['(^_^)', 'Vui vẻ'],
  ['(≧▽≦)', 'Cười vui'],
  ['(づ｡◕‿‿◕｡)づ', 'Ôm bạn'],
  ['(｡♥‿♥｡)', 'Yêu thương'],
  ['(ง •̀_•́)ง', 'Cố lên'],
  ['(•̀ᴗ•́)و', 'Quyết tâm'],
  ['(╥_╥)', 'Buồn khóc'],
  ['(¬_¬)', 'Hoài nghi'],
  ['¯\\_(ツ)_/¯', 'Không biết nữa'],
  ['(－_－) zzZ', 'Buồn ngủ'],
  ['(☞ﾟヮﾟ)☞', 'Chính là bạn'],
  ['(✿◠‿◠)', 'Mỉm cười'],
] as const

export function expressionSearch(value: string, query: string) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLocaleLowerCase('vi')
  return normalize(value).includes(normalize(query.trim()))
}
