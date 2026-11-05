// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Chi phan ProjectCore ma the cu tri can doc. ProjectCore KHONG bi sua.
interface IProjectCore {
    function electionCount() external view returns (uint256);
    function hasRevealed(uint256 id, address voter) external view returns (bool);
    function getElectionBasicInfo(uint256 id)
        external
        view
        returns (address admin, string memory title, bool isActivated, bytes32 merkleRoot);
}

/// @title VoterCardSBT - The cu tri (Soulbound NFT) cho VoteChain
/// @notice Moi vi chi mint DUOC 1 the cho moi cuoc bau, va chi khi da reveal thanh cong
///         (dieu kien duoc doc truc tiep tu ProjectCore.hasRevealed, khong tin frontend).
///         The khong chuyen nhuong (soulbound, ERC-5192). Khong luu lua chon/salt cua cu tri.
///         Tu viet toi gian, khong import, cung compiler 0.8.20 nhu cac hop dong con lai.
contract VoterCardSBT {
    // ---------- Loi ----------
    error NotRevealed();
    error ElectionNotFound();
    error InvalidAvatar();
    error AlreadyMinted();
    error Soulbound();
    error NonexistentToken();
    error ZeroAddress();
    error BadAvatarConfig();

    // ---------- Su kien (ERC-721 / ERC-5192) ----------
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Locked(uint256 tokenId);
    event CardMinted(uint256 indexed electionId, address indexed voter, uint256 indexed tokenId, uint256 serial, uint8 avatarId);

    // ---------- Hang so ----------
    /// @dev So avatar emoji du phong khi khong cau hinh anh ngoai.
    uint8 public constant FALLBACK_AVATAR_COUNT = 6;
    string public constant name = "VoteChain Voter Card";
    string public constant symbol = "VCARD";

    IProjectCore public immutable projectCore;
    /// @notice So mascot hop le (avatarId < avatarCount). Bat bien sau khi deploy.
    uint8 public immutable avatarCount;
    /// @notice Thu muc anh mascot bat bien (nen la ipfs://<CID>/). Rong = dung emoji du phong tren chain.
    string public avatarBaseURI;
    /// @notice Duoi file anh, vi du "svg" hoac "png".
    string public avatarExt;

    struct Card {
        uint64 electionId;
        uint64 serial;
        uint64 issuedAt;
        uint8 avatarId;
        address owner;
    }

    mapping(uint256 => Card) private _cards; // tokenId => the (owner == 0 nghia la chua mint)
    mapping(address => uint256) private _balances;
    mapping(uint256 => uint256) public nextSerial; // electionId => so the da cap

    /// @param avatarBaseURI_ vd "ipfs://<CID>/" (ket thuc bang "/"); de "" de dung emoji du phong.
    /// @param avatarCount_   so mascot (1..255) khi co anh ngoai; bi bo qua (= 6) khi de baseURI rong.
    /// @param avatarExt_     duoi file, vd "svg"; bat buoc khi co baseURI.
    constructor(address projectCore_, string memory avatarBaseURI_, uint8 avatarCount_, string memory avatarExt_) {
        if (projectCore_ == address(0)) revert ZeroAddress();
        projectCore = IProjectCore(projectCore_);
        bool ext = bytes(avatarBaseURI_).length != 0;
        if (ext && (avatarCount_ == 0 || bytes(avatarExt_).length == 0)) revert BadAvatarConfig();
        avatarCount = ext ? avatarCount_ : FALLBACK_AVATAR_COUNT;
        if (ext) {
            avatarBaseURI = avatarBaseURI_;
            avatarExt = avatarExt_;
        }
    }

    // ---------- Mint ----------
    /// @notice tokenId xac dinh theo (electionId, vi) nen khong the mint 2 lan cho cung cap.
    function tokenIdOf(uint256 electionId, address voter) public pure returns (uint256) {
        return (electionId << 160) | uint256(uint160(voter));
    }

    function hasCard(uint256 electionId, address voter) public view returns (bool) {
        return _cards[tokenIdOf(electionId, voter)].owner != address(0);
    }

    /// @notice Chi nguoi goi (msg.sender) moi nhan duoc the. Khong co tham so "to" de tranh mint ho.
    function mint(uint256 electionId, uint8 avatarId) external returns (uint256 tokenId) {
        if (electionId >= projectCore.electionCount()) revert ElectionNotFound();
        if (avatarId >= avatarCount) revert InvalidAvatar();
        if (!projectCore.hasRevealed(electionId, msg.sender)) revert NotRevealed();

        tokenId = tokenIdOf(electionId, msg.sender);
        if (_cards[tokenId].owner != address(0)) revert AlreadyMinted();

        uint256 serial = ++nextSerial[electionId];
        _cards[tokenId] = Card({
            electionId: uint64(electionId),
            serial: uint64(serial),
            issuedAt: uint64(block.timestamp),
            avatarId: avatarId,
            owner: msg.sender
        });
        _balances[msg.sender] += 1;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Locked(tokenId);
        emit CardMinted(electionId, msg.sender, tokenId, serial, avatarId);
    }

    // ---------- Doc the ----------
    function cardOf(uint256 tokenId)
        external
        view
        returns (uint256 electionId, address owner, uint256 serial, uint256 issuedAt, uint8 avatarId)
    {
        Card memory c = _requireCard(tokenId);
        return (c.electionId, c.owner, c.serial, c.issuedAt, c.avatarId);
    }

    function _requireCard(uint256 tokenId) private view returns (Card memory c) {
        c = _cards[tokenId];
        if (c.owner == address(0)) revert NonexistentToken();
    }

    // ---------- ERC-721 (chi phan doc; moi thao tac chuyen nhuong deu revert) ----------
    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _requireCard(tokenId).owner;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireCard(tokenId);
        return true;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        _requireCard(tokenId);
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 // ERC-165
            || id == 0x80ac58cd // ERC-721
            || id == 0x5b5e139f // ERC-721 Metadata
            || id == 0xb45a3c0e; // ERC-5192
    }

    // ---------- Metadata dung tren chain (khong phu thuoc hosting ngoai) ----------
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        Card memory c = _requireCard(tokenId);
        (, string memory title, , ) = projectCore.getElectionBasicInfo(c.electionId);
        string memory safeTitle = _escape(title);
        string memory serialStr = _pad(c.serial);

        string memory image;
        if (bytes(avatarBaseURI).length == 0) {
            image = string.concat("data:image/svg+xml;base64,", _b64(bytes(_fallbackSvg(c, title, serialStr))));
        } else {
            image = _escape(string.concat(avatarBaseURI, _u(c.avatarId), ".", avatarExt));
        }

        string memory json = string.concat(
            '{"name":"Voter Card #', serialStr, " - ", safeTitle, '",',
            '"description":"Soulbound proof of participation. It does not record any choice.",',
            '"image":"', image, '",',
            '"attributes":[',
            '{"trait_type":"Election ID","value":', _u(c.electionId), "},",
            '{"trait_type":"Serial","value":', _u(c.serial), "},",
            '{"trait_type":"Issued At","display_type":"date","value":', _u(c.issuedAt), "},",
            '{"trait_type":"Avatar","value":', _u(c.avatarId), "}",
            "]}"
        );
        return string.concat("data:application/json;base64,", _b64(bytes(json)));
    }

    function _fallbackSvg(Card memory c, string memory title, string memory serialStr) private pure returns (string memory) {
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'>",
            "<rect width='400' height='560' rx='24' fill='", _bg(c.avatarId), "'/>",
            "<circle cx='200' cy='200' r='90' fill='", _fg(c.avatarId), "'/>",
            "<text x='200' y='225' font-size='80' text-anchor='middle'>", _face(c.avatarId), "</text>",
            "<text x='200' y='370' font-size='22' text-anchor='middle' fill='#0f172a' font-family='sans-serif'>",
            _xml(title), "</text>",
            "<text x='200' y='410' font-size='18' text-anchor='middle' fill='#334155' font-family='sans-serif'>",
            "Voter Card #", serialStr, "</text>",
            "<text x='200' y='440' font-size='14' text-anchor='middle' fill='#475569' font-family='sans-serif'>",
            "Election ", _u(c.electionId), "</text>",
            "</svg>"
        );
    }

    // ---------- Tien ich noi bo ----------
    function _bg(uint8 a) private pure returns (string memory) {
        string[6] memory x = ["#e0f2fe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#ffedd5"];
        return x[a];
    }

    function _fg(uint8 a) private pure returns (string memory) {
        string[6] memory x = ["#7dd3fc", "#86efac", "#fcd34d", "#f9a8d4", "#c4b5fd", "#fdba74"];
        return x[a];
    }

    function _face(uint8 a) private pure returns (string memory) {
        string[6] memory x = ["&#x1F431;", "&#x1F43C;", "&#x1F98A;", "&#x1F430;", "&#x1F989;", "&#x1F438;"];
        return x[a];
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 n;
        while (t != 0) { n++; t /= 10; }
        bytes memory b = new bytes(n);
        while (v != 0) { n--; b[n] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(b);
    }

    function _pad(uint256 v) private pure returns (string memory) {
        string memory s = _u(v);
        uint256 l = bytes(s).length;
        if (l >= 4) return s;
        bytes memory z = new bytes(4 - l);
        for (uint256 i = 0; i < z.length; i++) z[i] = "0";
        return string.concat(string(z), s);
    }

    /// @dev Thoat cho chuoi JSON: " \ va ky tu dieu khien.
    function _escape(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length * 2);
        uint256 j;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch == '"' || ch == "\\") { o[j++] = "\\"; o[j++] = ch; }
            else if (uint8(ch) < 0x20) { o[j++] = " "; }
            else { o[j++] = ch; }
        }
        bytes memory r = new bytes(j);
        for (uint256 k = 0; k < j; k++) r[k] = o[k];
        return string(r);
    }

    /// @dev Thoat cho noi dung XML/SVG: < > & ' ". Cung thoat luon \ cho JSON.
    function _xml(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length * 6);
        uint256 j;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            bytes memory rep;
            if (ch == "<") rep = "&lt;";
            else if (ch == ">") rep = "&gt;";
            else if (ch == "&") rep = "&amp;";
            else if (ch == "'") rep = "&#39;";
            else if (ch == '"') rep = "&quot;";
            else if (uint8(ch) < 0x20) rep = " ";
            else if (ch == "\\") rep = "/";
            if (rep.length == 0) { o[j++] = ch; }
            else { for (uint256 k = 0; k < rep.length; k++) o[j++] = rep[k]; }
        }
        bytes memory r = new bytes(j);
        for (uint256 m = 0; m < j; m++) r[m] = o[m];
        return string(r);
    }

    bytes private constant _TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function _b64(bytes memory data) private pure returns (string memory) {
        if (data.length == 0) return "";
        uint256 len = 4 * ((data.length + 2) / 3);
        bytes memory out = new bytes(len);
        bytes memory t = _TABLE;
        uint256 j;
        for (uint256 i = 0; i < data.length; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b = i + 1 < data.length ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < data.length ? uint8(data[i + 2]) : 0;
            uint256 n = (a << 16) | (b << 8) | c;
            out[j++] = t[(n >> 18) & 63];
            out[j++] = t[(n >> 12) & 63];
            out[j++] = i + 1 < data.length ? t[(n >> 6) & 63] : bytes1("=");
            out[j++] = i + 2 < data.length ? t[n & 63] : bytes1("=");
        }
        return string(out);
    }
}
