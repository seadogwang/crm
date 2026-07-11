package com.loyalty.platform.member;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 会员通 SPI 控制器 — 供渠道（天猫/京东）调用。
 */
@RestController
@RequestMapping("/api/spi/{channel}")
public class MemberPassController {

    private static final Logger log = LoggerFactory.getLogger(MemberPassController.class);

    private final OneIdMatcher oneIdMatcher;
    private final ChannelBindingService bindingService;

    public MemberPassController(OneIdMatcher oneIdMatcher, ChannelBindingService bindingService) {
        this.oneIdMatcher = oneIdMatcher;
        this.bindingService = bindingService;
    }

    /** 绑定查询 */
    @PostMapping("/bind/query")
    public ResponseEntity<ApiResponse<Map<String, Object>>> bindQuery(
            @PathVariable String channel, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        OneIdMatcher.MatchRequest req = OneIdMatcher.MatchRequest.builder()
                .programCode(pc).channel(channel.toUpperCase())
                .channelUserId((String) body.get("channelUserId"))
                .channelUnionId((String) body.get("channelUnionId"))
                .encryptedMobile((String) body.get("encryptedMobile"))
                .plainMobile((String) body.get("plainMobile"))
                .email((String) body.get("email"))
                .encryptType((String) body.get("encryptType"))
                .build();

        OneIdMatcher.MatchResult result = oneIdMatcher.match(req);
        Map<String, Object> resp = new LinkedHashMap<>();
        if (result.isFound()) {
            resp.put("bindable", true);
            resp.put("bindCode", "SUC");
            resp.put("memberId", result.memberId());
        } else if (result.isConflict()) {
            resp.put("bindable", false);
            resp.put("bindCode", "E02");
        } else {
            resp.put("bindable", false);
            resp.put("bindCode", "E04");
        }
        return ResponseEntity.ok(ApiResponse.success(resp));
    }

    /** 绑定 */
    @PostMapping("/bind")
    public ResponseEntity<ApiResponse<Map<String, Object>>> bind(
            @PathVariable String channel, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String ch = channel.toUpperCase();

        // 解绑处理
        if ("2".equals(body.get("type"))) {
            bindingService.unbindChannel(pc, ch, (String) body.get("channelUserId"),
                    (String) body.getOrDefault("reason", "用户主动解绑"));
            return ResponseEntity.ok(ApiResponse.success(Map.of("bindCode", "SUC")));
        }

        // 身份匹配
        OneIdMatcher.MatchRequest req = OneIdMatcher.MatchRequest.builder()
                .programCode(pc).channel(ch)
                .channelUserId((String) body.get("channelUserId"))
                .channelUnionId((String) body.get("channelUnionId"))
                .encryptedMobile((String) body.get("encryptedMobile"))
                .plainMobile((String) body.get("plainMobile"))
                .build();

        OneIdMatcher.MatchResult result = oneIdMatcher.match(req);
        if (!result.isFound()) {
            return ResponseEntity.ok(ApiResponse.error("E02", "会员不存在"));
        }

        ChannelBindingService.BindRequest bindReq = new ChannelBindingService.BindRequest(
                (String) body.get("channelUserId"), (String) body.get("channelUnionId"),
                (String) body.get("nickname"), (String) body.get("avatar"),
                (String) body.get("encryptedMobile"), (String) body.get("plainMobile"),
                (String) body.get("encryptType"), (String) body.get("type"));
        bindingService.bindChannel(pc, result.memberId(), ch, bindReq);

        return ResponseEntity.ok(ApiResponse.success(Map.of("bindCode", "SUC", "memberId", result.memberId())));
    }

    /** 获取会员渠道绑定 */
    @GetMapping("/member-bindings/{memberId}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getBindings(
            @PathVariable String channel, @PathVariable String memberId) {
        String pc = TenantContext.getRequired();
        var bindings = bindingService.getMemberBindings(pc, memberId);
        List<Map<String, Object>> result = bindings.stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channel", b.getChannel());
            m.put("channelUserId", b.getChannelUserId());
            m.put("channelNickname", b.getChannelNickname());
            m.put("channelAvatar", b.getChannelAvatar());
            m.put("status", b.getStatus());
            m.put("authorizedAt", b.getAuthorizedAt());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}