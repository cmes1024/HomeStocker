package com.homestocker.auth.app;

import com.homestocker.auth.AuthPrincipal;
import com.homestocker.auth.RequestContext;
import com.homestocker.auth.SessionService;
import com.homestocker.auth.api.LoginData;
import com.homestocker.auth.api.MeData;
import com.homestocker.auth.api.UserView;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.infra.wechat.Code2SessionResult;
import com.homestocker.infra.wechat.WeChatClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

  private final WeChatClient weChatClient;
  private final UserRepository userRepository;
  private final SessionService sessionService;

  public AuthService(
      WeChatClient weChatClient, UserRepository userRepository, SessionService sessionService) {
    this.weChatClient = weChatClient;
    this.userRepository = userRepository;
    this.sessionService = sessionService;
  }

  @Transactional
  public LoginData login(String code) {
    Code2SessionResult wx = weChatClient.code2session(code);
    UserRow user = userRepository.upsertOnLogin(wx.openid());
    String token = sessionService.create(wx.openid());
    sessionService.storeSessionKey(wx.openid(), wx.sessionKey());
    return new LoginData(token, UserView.from(user));
  }

  public MeData me() {
    AuthPrincipal principal = RequestContext.require();
    UserRow user =
        userRepository
            .findByOpenid(principal.openid())
            .orElseGet(() -> userRepository.upsertOnLogin(principal.openid()));
    return new MeData(UserView.from(user));
  }

  public void logout() {
    AuthPrincipal principal = RequestContext.get();
    if (principal != null) {
      sessionService.destroy(principal.token());
    }
  }
}
