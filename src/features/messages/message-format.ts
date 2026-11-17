export const timeLabel = (time: number) =>
  new Date(time).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
