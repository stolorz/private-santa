/** Shared payload for WhatsApp and Signal invitation sends. */
export type PhoneMessage = {
  to: string;
  giverName: string;
  secondParam: string;
  text?: string;
};

export type SendResult = {
  to: string;
  ok: boolean;
  error?: string;
};
