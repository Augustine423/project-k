declare module "webrtc-adapter" {
  const adapter: {
    browserDetails: {
      browser: string;
      version: number;
    };
  };
  export default adapter;
}
