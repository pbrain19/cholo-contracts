// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.6;

import "contracts/interfaces/external/velodrome/core/libraries/TickMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "base64-sol/base64.sol";

/// @title NFTSVG
/// @notice Provides a function for generating an SVG associated with a CL NFT
library NFTSVG {
    using Strings for uint256;
    using SafeMath for uint256;

    function generateSVG(
        string memory quoteTokenSymbol,
        string memory baseTokenSymbol,
        uint256 quoteTokensOwed,
        uint256 baseTokensOwed,
        uint256 tokenId,
        int24 tickLower,
        int24 tickUpper,
        int24 tickSpacing,
        uint8 quoteTokenDecimals,
        uint8 baseTokenDecimals
    ) public pure returns (string memory svg) {
        return string(
            abi.encodePacked(
                '<svg width="800" height="800" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">',
                '<g id="NFT Velo" clip-path="url(#clip0_1098_756)">',
                '<rect width="800" height="800" fill="#171F2D"/>',
                '<rect id="Rectangle 176" width="800" height="800" fill="#252525"/>',
                '<g id="shadow">',
                '<g id="Group 465">',
                '<path id="Rectangle 173" d="M394 234L394 566L-8.68543e-05 566L-9.15527e-05 234L394 234Z" fill="url(#paint0_linear_1098_756)"/>',
                "</g>",
                "</g>",
                generateTopText({
                    quoteTokenSymbol: quoteTokenSymbol,
                    baseTokenSymbol: baseTokenSymbol,
                    tokenId: tokenId,
                    tickSpacing: tickSpacing
                }),
                generateArt(),
                generateBottomText({
                    quoteTokenSymbol: quoteTokenSymbol,
                    baseTokenSymbol: baseTokenSymbol,
                    quoteTokensOwed: quoteTokensOwed,
                    baseTokensOwed: baseTokensOwed,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    quoteTokenDecimals: quoteTokenDecimals,
                    baseTokenDecimals: baseTokenDecimals
                }),
                generateSVGDefs(),
                "</svg>"
            )
        );
    }

    function generateTopText(
        string memory quoteTokenSymbol,
        string memory baseTokenSymbol,
        uint256 tokenId,
        int24 tickSpacing
    ) private pure returns (string memory svg) {
        string memory poolId =
            string(abi.encodePacked("CL", tickToString(tickSpacing), "-", quoteTokenSymbol, "/", baseTokenSymbol));
        string memory tokenIdStr = string(abi.encodePacked("ID #", tokenId.toString()));
        string memory id = string(abi.encodePacked(poolId, tokenIdStr));
        svg = string(
            abi.encodePacked(
                '<g id="',
                id,
                '">',
                '<text fill="#F3F4F6" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="32" font-weight="bold" letter-spacing="0em"><tspan x="56" y="85.5938">',
                poolId,
                "</tspan></text>",
                "</g>",
                '<text id="ID #1223" fill="#F3F4F6" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="20" letter-spacing="0em">',
                '<tspan x="56" y="128.913">',
                tokenIdStr,
                "</tspan>",
                "</text>"
            )
        );
    }

    function generateArt() private pure returns (string memory svg) {
        svg = string(
            abi.encodePacked(
                '<circle id="circle" cx="400" cy="399.837" r="165.837" fill="#FF1100" />',
                '<g id="velo"><g id="Group">',
                '<path id="Vector" d="M293.965 393.384L300.734 410.678L307.462 393.384H311.625L302.524 416.3H298.685L289.534 393.384H293.965V393.384Z" fill="#F3F4F6" />',
                '<path id="Vector_2" d="M320.36 411.869C321.642 412.693 323.199 413.193 324.84 413.193C329.461 413.193 333.075 409.488 333.075 404.824H337.006C337.006 411.502 331.61 416.764 324.749 416.764C317.979 416.764 312.717 411.552 312.717 404.965C312.717 398.238 318.113 392.933 324.974 392.933C328.362 392.933 332.202 394.215 334.716 397.554L320.36 411.869ZM317.887 409.304L329.32 397.822C327.996 396.956 326.482 396.498 324.84 396.498C320.268 396.498 316.655 400.203 316.655 404.824C316.655 406.473 317.113 408.022 317.887 409.304Z" fill="#F3F4F6" />'
                '<path id="Vector_3" d="M341.402 382.909H345.699V416.306H341.402V382.909V382.909Z" fill="#F3F4F6" />',
                '<path id="Vector_4" d="M350.552 404.824C350.552 398.055 355.765 392.933 362.676 392.933C369.628 392.933 374.841 398.055 374.841 404.824C374.841 411.643 369.628 416.764 362.676 416.764C355.765 416.764 350.552 411.636 350.552 404.824ZM362.676 412.918C367.247 412.918 370.678 409.438 370.678 404.824C370.678 400.252 367.247 396.73 362.676 396.73C358.146 396.73 354.715 400.252 354.715 404.824C354.715 409.445 358.146 412.918 362.676 412.918Z" fill="#F3F4F6" />',
                '<path id="Vector_5" d="M390.578 416.307C383.168 416.307 378.229 411.735 378.229 404.824C378.229 397.963 383.168 393.391 390.578 393.391H394.417V382.916H398.715V416.314H390.578V416.307ZM390.578 412.46H394.417V397.181H390.578C385.732 397.181 382.527 400.245 382.527 404.817C382.527 409.445 385.725 412.46 390.578 412.46Z" fill="#F3F4F6" />',
                '<path id="Vector_6" d="M405.033 393.384H409.33V400.02L416.424 392.926L419.122 395.624L409.33 405.366V416.299H405.033V393.384Z" fill="#F3F4F6" />',
                '<path id="Vector_7" d="M419.397 404.824C419.397 398.055 424.61 392.933 431.52 392.933C438.473 392.933 443.686 398.055 443.686 404.824C443.686 411.643 438.473 416.764 431.52 416.764C424.61 416.764 419.397 411.636 419.397 404.824ZM431.52 412.918C436.092 412.918 439.523 409.438 439.523 404.824C439.523 400.252 436.092 396.73 431.52 396.73C426.991 396.73 423.56 400.252 423.56 404.824C423.56 409.445 426.991 412.918 431.52 412.918Z" fill="#F3F4F6" />',
                '<path id="Vector_8" d="M448.532 393.384H452.738V396.131C456.443 393.342 458.042 392.926 460.148 392.926C462.896 392.926 465.27 394.342 466.418 396.631C470.623 393.384 472.321 392.926 474.512 392.926C478.443 392.926 481.556 395.765 481.556 400.062V416.299H477.259V400.52C477.259 398.414 475.752 396.857 473.829 396.857C472.363 396.857 471.264 397.174 467.193 400.562V416.299H462.896V400.52C462.896 398.414 461.388 396.857 459.465 396.857C458 396.857 456.901 397.174 452.829 400.562V416.299H448.532V393.384V393.384Z" fill="#F3F4F6" />',
                '<path id="Vector_9" d="M493.821 411.869C495.103 412.693 496.659 413.193 498.301 413.193C502.922 413.193 506.536 409.488 506.536 404.824H510.466C510.466 411.502 505.07 416.764 498.209 416.764C491.44 416.764 486.177 411.552 486.177 404.965C486.177 398.238 491.573 392.933 498.435 392.933C501.823 392.933 505.662 394.215 508.177 397.554L493.821 411.869ZM491.355 409.304L502.788 397.822C501.464 396.956 499.949 396.498 498.308 396.498C493.736 396.498 490.122 400.203 490.122 404.824C490.115 406.473 490.573 408.022 491.355 409.304Z" fill="#F3F4F6" />'
                "</g>",
                "</g>"
            )
        );
    }

    function generateSVGDefs() private pure returns (string memory svg) {
        svg = string(
            abi.encodePacked(
                "<defs>",
                '<linearGradient id="paint0_linear_1098_756" x1="491" y1="566" x2="26.2102" y2="566" gradientUnits="userSpaceOnUse">'
                '<stop offset="0.142" stop-color="white" stop-opacity="0.2"/>',
                '<stop offset="1" stop-opacity="0"/>',
                "</linearGradient>",
                '<clipPath id="clip0_1098_756">',
                '<rect width="800" height="800" fill="white"/>',
                "</clipPath>",
                "</defs>"
            )
        );
    }

    function generateBottomText(
        string memory quoteTokenSymbol,
        string memory baseTokenSymbol,
        uint256 quoteTokensOwed,
        uint256 baseTokensOwed,
        int24 tickLower,
        int24 tickUpper,
        uint8 quoteTokenDecimals,
        uint8 baseTokenDecimals
    ) internal pure returns (string memory svg) {
        string memory balance0 = balanceToDecimals(quoteTokensOwed, quoteTokenDecimals);
        string memory balance1 = balanceToDecimals(baseTokensOwed, baseTokenDecimals);
        string memory balances =
            string(abi.encodePacked(balance0, " ", quoteTokenSymbol, " ~ ", balance1, " ", baseTokenSymbol));
        string memory tickLow = string(abi.encodePacked(tickToString(tickLower), " Low "));
        string memory tickHigh = string(abi.encodePacked(tickToString(tickUpper), " High "));
        svg = string(
            abi.encodePacked(
                '<text id="',
                balances,
                '" fill="#F3F4F6" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="32" font-weight="bold" letter-spacing="0em"><tspan x="56" y="676.594">',
                balances,
                "</tspan></text>",
                '<rect id="line" opacity="0.05" x="56" y="700" width="693" height="2" fill="#D9D9D9"/>',
                '<text id="',
                tickLow,
                "&#226;&#128;&#148; ",
                tickHigh,
                '" fill="#F3F4F6" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="20" letter-spacing="0em"><tspan x="56" y="736.434">',
                tickLow,
                "&#x2014; ",
                tickHigh,
                "</tspan></text>",
                "</g>"
            )
        );
    }

    function balanceToDecimals(uint256 balance, uint8 decimals) private pure returns (string memory) {
        uint256 divisor = 10 ** decimals;
        uint256 integerPart = balance / divisor;
        uint256 fractionalPart = balance % divisor;

        // trim to 5 dp
        if (decimals > 5) {
            uint256 adjustedDivisor = 10 ** (decimals - 5);
            fractionalPart = adjustedDivisor > 0 ? fractionalPart / adjustedDivisor : fractionalPart;
        }

        // add leading zeroes
        string memory leadingZeros = "";
        uint256 fractionalPartLength = bytes(fractionalPart.toString()).length;
        uint256 zerosToAdd = 5 > fractionalPartLength ? 5 - fractionalPartLength : 0;
        for (uint256 i = 0; i < zerosToAdd; i++) {
            leadingZeros = string(abi.encodePacked("0", leadingZeros));
        }
        return string(abi.encodePacked(integerPart.toString(), ".", leadingZeros, fractionalPart.toString()));
    }

    function tickToString(int24 tick) private pure returns (string memory) {
        string memory sign = "";
        if (tick < 0) {
            tick = tick * -1;
            sign = "-";
        }
        return string(abi.encodePacked(sign, uint256(tick).toString()));
    }
}
